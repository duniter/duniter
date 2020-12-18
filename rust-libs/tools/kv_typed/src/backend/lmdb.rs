//  Copyright (C) 2020 Éloïs SANCHEZ.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

//! Memory backend for KV Typed,

use crate::*;
use lmdb::{traits::CreateCursor as _, LmdbResultExt as _};
use lmdb_zero as lmdb;
use std::path::PathBuf;

#[derive(Clone, Copy, Debug)]
/// Be careful with this backend
/// LMDB does not support multiple iterators in the same thread. So you need to make sure that :
/// 1. Any iterator must be drop before any new call to the `iter()` method.
/// 2. If you are in an asynchronous context, an async task should never yield when it to an instantiated iterator.
pub struct Lmdb;

#[derive(Clone, Debug)]
pub struct LmdbConf {
    folder_path: PathBuf,
    temporary: bool,
}
impl Default for LmdbConf {
    fn default() -> Self {
        LmdbConf {
            folder_path: PathBuf::default(),
            temporary: false,
        }
    }
}
impl LmdbConf {
    pub fn folder_path(mut self, folder_path: PathBuf) -> Self {
        self.folder_path = folder_path;
        self
    }
    pub fn temporary(mut self, temporary: bool) -> Self {
        self.temporary = temporary;
        self
    }
}

impl Backend for Lmdb {
    const NAME: &'static str = "lmdb";
    type Col = LmdbCol;
    type Conf = LmdbConf;

    fn open(conf: &Self::Conf) -> KvResult<Self> {
        std::fs::create_dir_all(conf.folder_path.as_path())?;
        Ok(Lmdb)
    }
    fn open_col(&mut self, conf: &Self::Conf, col_name: &str) -> KvResult<Self::Col> {
        let path: PathBuf = conf.folder_path.join(col_name);
        let exist = path.as_path().exists();
        if !exist {
            std::fs::create_dir(path.as_path())?;
        }
        let path_to_remove = if conf.temporary {
            Some(path.clone())
        } else {
            None
        };
        let path = path
            .into_os_string()
            .into_string()
            .expect("Invalid DB path");
        let mut env_flags = lmdb::open::Flags::empty();
        env_flags.insert(lmdb::open::WRITEMAP);
        env_flags.insert(lmdb::open::MAPASYNC);
        env_flags.insert(lmdb::open::NOLOCK);
        let col_options = if exist {
            lmdb::DatabaseOptions::defaults()
        } else {
            lmdb::DatabaseOptions::new(lmdb::db::CREATE)
        };
        let env =
            std::sync::Arc::new(unsafe { lmdb::EnvBuilder::new()?.open(&path, env_flags, 0o600)? });
        let tree = std::sync::Arc::new(lmdb::Database::open(env.clone(), None, &col_options)?);
        Ok(LmdbCol {
            inner: LmdbColInner { env, tree },
            path_to_remove,
        })
    }
}

#[derive(Clone, Debug)]
pub struct LmdbCol {
    inner: LmdbColInner,
    path_to_remove: Option<PathBuf>,
}

impl Drop for LmdbCol {
    fn drop(&mut self) {
        if let Some(ref path) = self.path_to_remove {
            let _ = std::fs::remove_dir(path);
        }
    }
}

#[derive(Clone, Debug)]
struct LmdbColInner {
    env: std::sync::Arc<lmdb::Environment>,
    tree: std::sync::Arc<lmdb::Database<'static>>,
}

#[derive(Debug, Default)]
pub struct LmdbBatch {
    upsert_ops: Vec<(IVec, IVec)>,
    remove_ops: Vec<IVec>,
}

impl BackendBatch for LmdbBatch {
    fn upsert(&mut self, k: &[u8], v: &[u8]) {
        self.upsert_ops.push((k.into(), v.into()));
    }

    fn remove(&mut self, k: &[u8]) {
        self.remove_ops.push(k.into());
    }
}

#[derive(Debug)]
struct LmdbIterAccess {
    env: std::sync::Arc<lmdb::Environment>,
    access: lmdb::ConstAccessor<'static>,
    tree: std::sync::Arc<lmdb::Database<'static>>,
    tx: lmdb::ReadTransaction<'static>,
}

#[derive(Debug)]
pub struct LmdbIter {
    access: Arc<LmdbIterAccess>,
    cursor: lmdb::Cursor<'static, 'static>,
    reversed: bool,
    started: bool,
}

impl LmdbIter {
    fn new(
        env: std::sync::Arc<lmdb::Environment>,
        tree: std::sync::Arc<lmdb::Database<'static>>,
    ) -> Self {
        let tx = lmdb::ReadTransaction::new(env.clone()).expect("fail to read DB");
        let tx_static: &'static lmdb::ReadTransaction<'static> =
            unsafe { std::mem::transmute(&tx) };
        let access = tx_static.access();
        let cursor = tx_static
            .cursor(tree.clone())
            .expect("fail to create DB cursor");
        LmdbIter {
            access: Arc::new(LmdbIterAccess {
                access,
                env,
                tree,
                tx,
            }),
            cursor,
            reversed: false,
            started: false,
        }
    }
}

impl Iterator for LmdbIter {
    type Item = Result<(&'static [u8], &'static [u8]), DynErr>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.reversed {
            if self.started {
                match self
                    .cursor
                    .prev::<[u8], [u8]>(unsafe {
                        // # Safety
                        // Lifetime of accessor is used to track db and lmdb_tx lifetimes: These are already static.
                        // It's safe because the byte references will be transformed into K and V owned types before
                        // being exposed to the user API.
                        std::mem::transmute(&self.access.access)
                    })
                    .to_opt()
                {
                    Ok(Some((k, v))) => Some(Ok((k, v))),
                    Ok(None) => None,
                    Err(e) => Some(Err(e.into())),
                }
            } else {
                self.started = true;
                match self
                    .cursor
                    .last::<[u8], [u8]>(unsafe {
                        // # Safety
                        // Lifetime of accessor is used to track db and lmdb_tx lifetimes: These are already static.
                        // It's safe because the byte references will be transformed into K and V owned types before
                        // being exposed to the user API.
                        std::mem::transmute(&self.access.access)
                    })
                    .to_opt()
                {
                    Ok(Some((k, v))) => Some(Ok((k, v))),
                    Ok(None) => None,
                    Err(e) => Some(Err(e.into())),
                }
            }
        } else if self.started {
            match self
                .cursor
                .next::<[u8], [u8]>(unsafe {
                    // # Safety
                    // Lifetime of accessor is used to track db and lmdb_tx lifetimes: These are already static.
                    // It's safe because the byte references will be transformed into K and V owned types before
                    // being exposed to the user API.
                    std::mem::transmute(&self.access.access)
                })
                .to_opt()
            {
                Ok(Some((k, v))) => Some(Ok((k, v))),
                Ok(None) => None,
                Err(e) => Some(Err(e.into())),
            }
        } else {
            self.started = true;
            match self
                .cursor
                .first::<[u8], [u8]>(unsafe {
                    // # Safety
                    // Lifetime of accessor is used to track db and lmdb_tx lifetimes: These are already static.
                    // It's safe because the byte references will be transformed into K and V owned types before
                    // being exposed to the user API.
                    std::mem::transmute(&self.access.access)
                })
                .to_opt()
            {
                Ok(Some((k, v))) => Some(Ok((k, v))),
                Ok(None) => None,
                Err(e) => Some(Err(e.into())),
            }
        }
    }
}

impl ReversableIterator for LmdbIter {
    fn reverse(mut self) -> Self {
        self.reversed = true;
        self
    }
}

impl BackendIter<&'static [u8], &'static [u8]> for LmdbIter {}

impl BackendCol for LmdbCol {
    type Batch = LmdbBatch;
    type KeyBytes = &'static [u8];
    type ValueBytes = &'static [u8];
    type Iter = LmdbIter;

    fn get<K: Key, V: Value>(&self, k: &K) -> KvResult<Option<V>> {
        let tx = lmdb::ReadTransaction::new(self.inner.tree.env())?;
        let access = tx.access();
        k.as_bytes(|k_bytes| {
            access
                .get(&self.inner.tree, k_bytes)
                .to_opt()?
                .map(|bytes| V::from_bytes(&bytes).map_err(|e| KvError::DeserError(e.into())))
                .transpose()
        })
    }

    fn get_ref<K: Key, V: ValueZc, D, F: Fn(&V::Ref) -> KvResult<D>>(
        &self,
        k: &K,
        f: F,
    ) -> KvResult<Option<D>> {
        k.as_bytes(|k_bytes| {
            let tx = lmdb::ReadTransaction::new(self.inner.tree.env())?;
            let access = tx.access();
            access
                .get::<_, [u8]>(&self.inner.tree, k_bytes)
                .to_opt()?
                .map(|bytes| {
                    if let Some(layout_verified) = zerocopy::LayoutVerified::<_, V::Ref>::new(bytes)
                    {
                        f(&layout_verified)
                    } else {
                        Err(KvError::DeserError(
                            "Bytes are invalid length or alignment.".to_owned(),
                        ))
                    }
                })
                .transpose()
        })
    }

    fn get_ref_slice<K: Key, V: ValueSliceZc, D, F: Fn(&[V::Elem]) -> KvResult<D>>(
        &self,
        k: &K,
        f: F,
    ) -> KvResult<Option<D>> {
        k.as_bytes(|k_bytes| {
            let tx = lmdb::ReadTransaction::new(self.inner.tree.env())?;
            let access = tx.access();
            access
                .get::<_, [u8]>(&self.inner.tree, k_bytes)
                .to_opt()?
                .map(|bytes| {
                    if let Some(layout_verified) =
                        zerocopy::LayoutVerified::<_, [V::Elem]>::new_slice(
                            &bytes[V::prefix_len()..],
                        )
                    {
                        f(&layout_verified)
                    } else {
                        Err(KvError::DeserError(
                            "Bytes are invalid length or alignment.".to_owned(),
                        ))
                    }
                })
                .transpose()
        })
    }

    fn clear(&mut self) -> KvResult<()> {
        let tx = lmdb::WriteTransaction::new(self.inner.tree.env())?;
        {
            let mut access = tx.access();
            access.clear_db(&self.inner.tree)?;
        }
        tx.commit()?;
        Ok(())
    }

    fn count(&self) -> KvResult<usize> {
        let tx = lmdb::ReadTransaction::new(self.inner.tree.env())?;
        Ok(tx.db_stat(&self.inner.tree)?.entries)
    }

    fn iter<K: Key, V: Value>(&self, _range: RangeBytes) -> Self::Iter {
        LmdbIter::new(self.inner.env.clone(), self.inner.tree.clone())
    }

    fn put<K: Key, V: Value>(&mut self, k: &K, value: &V) -> KvResult<()> {
        value.as_bytes(|v_bytes| {
            let tx = lmdb::WriteTransaction::new(self.inner.tree.env())?;
            k.as_bytes(|k_bytes| {
                let mut access = tx.access();
                access.put(
                    &self.inner.tree,
                    k_bytes,
                    v_bytes,
                    lmdb::put::Flags::empty(),
                )
            })?;
            tx.commit()?;
            Ok(())
        })
    }

    fn delete<K: Key>(&mut self, k: &K) -> KvResult<()> {
        let tx = lmdb::WriteTransaction::new(self.inner.tree.env())?;
        k.as_bytes(|k_bytes| {
            let mut access = tx.access();
            access.del_key(&self.inner.tree, k_bytes).to_opt()
        })?;
        tx.commit()?;
        Ok(())
    }

    fn new_batch() -> Self::Batch {
        LmdbBatch::default()
    }

    fn write_batch(&mut self, inner_batch: Self::Batch) -> KvResult<()> {
        let tx = lmdb::WriteTransaction::new(self.inner.tree.env())?;
        {
            let mut access = tx.access();
            for (k, v) in inner_batch.upsert_ops {
                access.put(
                    &self.inner.tree,
                    k.as_ref(),
                    v.as_ref(),
                    lmdb::put::Flags::empty(),
                )?;
            }
            for k in inner_batch.remove_ops {
                access.del_key(&self.inner.tree, k.as_ref()).to_opt()?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    fn save(&self) -> KvResult<()> {
        Ok(self.inner.tree.env().sync(true)?)
    }
}

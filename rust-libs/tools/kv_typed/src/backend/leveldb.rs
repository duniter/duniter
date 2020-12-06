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

//! LevelDb backend for KV Typed

use crate::*;
pub use leveldb_minimal::database::batch::{Batch as _, Writebatch as WriteBatch};
use leveldb_minimal::database::cache::Cache as LevelDbCache;
pub use leveldb_minimal::database::error::Error as LevelDbError;
use leveldb_minimal::database::iterator::Iterator as LevelDbIterator;
pub use leveldb_minimal::database::Database as LevelDbDb;
use leveldb_minimal::iterator::{Iterable, LevelDBIterator as _};
use leveldb_minimal::kv::KV as _;
pub use leveldb_minimal::options::{Options as LevelDbOptions, ReadOptions, WriteOptions};
use leveldb_minimal::Compression;
use std::path::PathBuf;

#[derive(Clone, Copy, Debug)]
pub struct LevelDb;

impl Backend for LevelDb {
    const NAME: &'static str = "leveldb";
    type Col = LevelDbCol;
    type Conf = LevelDbConf;

    fn open(_conf: &Self::Conf) -> KvResult<Self> {
        Ok(LevelDb)
    }
    fn open_col(&mut self, conf: &Self::Conf, col_name: &str) -> KvResult<Self::Col> {
        Ok(LevelDbCol(Arc::new(LevelDbDb::open(
            &conf.db_path.join(col_name),
            conf.clone().into(),
        )?)))
    }
}

#[derive(Clone)]
pub struct LevelDbCol(Arc<LevelDbDb>);

impl Debug for LevelDbCol {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LevelDbCol")
            .field("0", &"Arc<LevelDbDb>")
            .finish()
    }
}

#[derive(Default)]
pub struct LevelDbBatch(WriteBatch);

impl Debug for LevelDbBatch {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LevelDbBatch")
            .field("0", &"WriteBatch")
            .finish()
    }
}

impl BackendBatch for LevelDbBatch {
    fn upsert(&mut self, k: &[u8], v: &[u8]) {
        self.0.put(k, v)
    }

    fn remove(&mut self, k: &[u8]) {
        self.0.delete(k)
    }
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct LevelDbBytes(Vec<u8>);
impl AsRef<[u8]> for LevelDbBytes {
    fn as_ref(&self) -> &[u8] {
        self.0.as_ref()
    }
}
impl FromBytes for LevelDbBytes {
    type Err = std::convert::Infallible;

    fn from_bytes(bytes: &[u8]) -> Result<Self, Self::Err> {
        Ok(Self(bytes.into()))
    }
}

impl BackendCol for LevelDbCol {
    type Batch = LevelDbBatch;
    type KeyBytes = LevelDbBytes;
    type ValueBytes = LevelDbBytes;
    type Iter = LevelDbIter;

    #[inline(always)]
    fn new_batch() -> Self::Batch {
        LevelDbBatch(WriteBatch::default())
    }
    fn clear(&mut self) -> KvResult<()> {
        let keys = self
            .0
            .iter(ReadOptions::new())
            .map(|(k, _v)| k)
            .collect::<Vec<Vec<u8>>>();
        for key in keys {
            self.0.delete(WriteOptions::new(), key.as_ref())?;
        }
        Ok(())
    }
    #[inline(always)]
    fn count(&self) -> KvResult<usize> {
        Ok(self
            .0
            .iter(ReadOptions {
                verify_checksums: false,
                fill_cache: false,
                snapshot: None,
            })
            .count())
    }
    #[inline(always)]
    fn contains_key<K: Key>(&self, k: &K) -> KvResult<bool> {
        k.as_bytes(|k_bytes| Ok(self.0.get(ReadOptions::new(), k_bytes)?.is_some()))
    }
    #[inline(always)]
    fn get<K: Key, V: Value>(&self, k: &K) -> KvResult<Option<V>> {
        k.as_bytes(|k_bytes| {
            self.0
                .get(ReadOptions::new(), k_bytes)?
                .map(|bytes| {
                    V::from_bytes(&bytes).map_err(|e| KvError::DeserError(format!("{}", e)))
                })
                .transpose()
        })
    }
    #[inline(always)]
    fn get_ref<K: Key, V: ValueZc, D, F: Fn(&V::Ref) -> KvResult<D>>(
        &self,
        k: &K,
        f: F,
    ) -> KvResult<Option<D>> {
        k.as_bytes(|k_bytes| {
            self.0
                .get(ReadOptions::new(), k_bytes)?
                .map(|bytes| {
                    if let Some(layout_verified) =
                        zerocopy::LayoutVerified::<_, V::Ref>::new(bytes.as_ref())
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
    #[inline(always)]
    fn get_ref_slice<K: Key, V: ValueSliceZc, D, F: Fn(&[V::Elem]) -> KvResult<D>>(
        &self,
        k: &K,
        f: F,
    ) -> KvResult<Option<D>> {
        k.as_bytes(|k_bytes| {
            self.0
                .get(ReadOptions::new(), k_bytes)?
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
    #[inline(always)]
    fn delete<K: Key>(&mut self, k: &K) -> KvResult<()> {
        k.as_bytes(|k_bytes| self.0.delete(WriteOptions::new(), k_bytes))?;
        Ok(())
    }
    #[inline(always)]
    fn put<K: Key, V: Value>(&mut self, k: &K, value: &V) -> KvResult<()> {
        value.as_bytes(|value_bytes| {
            k.as_bytes(|k_bytes| self.0.put(WriteOptions::new(), k_bytes, value_bytes))?;
            Ok(())
        })
    }
    #[inline(always)]
    fn write_batch(&mut self, inner_batch: Self::Batch) -> KvResult<()> {
        self.0.write(WriteOptions::new(), &inner_batch.0)?;
        Ok(())
    }
    #[inline(always)]
    fn iter<K: Key, V: Value>(&self, _range: RangeBytes) -> Self::Iter {
        LevelDbIter(self.0.iter(ReadOptions::new()))
    }
    #[inline(always)]
    fn iter_rev<K: Key, V: Value>(&self, _range: RangeBytes) -> Self::Iter {
        LevelDbIter(self.0.iter(ReadOptions::new()).reverse())
    }
    #[inline(always)]
    fn save(&self) -> KvResult<()> {
        Ok(())
    }
}

pub struct LevelDbIter(LevelDbIterator);
impl Debug for LevelDbIter {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LevelDbIter")
            .field("0", &"LevelDbIterator<'db>")
            .finish()
    }
}

impl Iterator for LevelDbIter {
    type Item = Result<(LevelDbBytes, LevelDbBytes), DynErr>;

    #[inline(always)]
    fn next(&mut self) -> Option<Self::Item> {
        self.0
            .next()
            .map(|(k, v)| Ok((LevelDbBytes(k), LevelDbBytes(v))))
    }
}
impl ReversableIterator for LevelDbIter {
    #[inline(always)]
    fn reverse(self) -> Self {
        Self(self.0.reverse())
    }
}
impl BackendIter<LevelDbBytes, LevelDbBytes> for LevelDbIter {}

#[derive(Clone, Debug)]
/// leveldb configuration
pub struct LevelDbConf {
    pub create_if_missing: bool,
    pub db_path: PathBuf,
    pub error_if_exists: bool,
    pub paranoid_checks: bool,
    pub write_buffer_size: Option<usize>,
    pub max_open_files: Option<i32>,
    pub block_size: Option<usize>,
    pub block_restart_interval: Option<i32>,
    pub compression: bool,
    pub cache: Option<usize>,
}

impl LevelDbConf {
    pub fn path(db_path: PathBuf) -> Self {
        Self {
            db_path,
            ..Default::default()
        }
    }
}

impl Default for LevelDbConf {
    fn default() -> Self {
        LevelDbConf {
            create_if_missing: true,
            db_path: PathBuf::default(),
            error_if_exists: false,
            paranoid_checks: false,
            write_buffer_size: None,
            max_open_files: None,
            block_size: None,
            block_restart_interval: None,
            compression: true,
            cache: None,
        }
    }
}

impl Into<LevelDbOptions> for LevelDbConf {
    fn into(self) -> LevelDbOptions {
        LevelDbOptions {
            create_if_missing: self.create_if_missing,
            error_if_exists: self.error_if_exists,
            paranoid_checks: self.paranoid_checks,
            write_buffer_size: self.write_buffer_size,
            max_open_files: self.max_open_files,
            block_size: self.block_size,
            block_restart_interval: self.block_restart_interval,
            compression: if self.compression {
                Compression::Snappy
            } else {
                Compression::No
            },
            cache: self.cache.map(LevelDbCache::new),
        }
    }
}

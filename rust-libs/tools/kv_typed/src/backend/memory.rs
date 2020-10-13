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
use parking_lot::{RwLock, RwLockReadGuard};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug)]
pub struct Mem;

#[derive(Clone, Copy, Debug, Default)]
pub struct MemConf {
    // Allows to prevent `MemConf` from being instantiated without using the `Default` trait.
    // Thus the eventual addition of a field in the future will not be a breaking change.
    phantom: PhantomData<()>,
}

type KeyBytes = IVec;
type ValueBytes = IVec;
type Map = BTreeMap<KeyBytes, ValueBytes>;
type ArcSharedMap = Arc<RwLock<Map>>;

impl Backend for Mem {
    const NAME: &'static str = "mem";
    type Col = MemCol;
    type Conf = MemConf;

    fn open(_conf: &Self::Conf) -> KvResult<Self> {
        Ok(Mem)
    }
    fn open_col(&mut self, _conf: &Self::Conf, _col_name: &str) -> KvResult<Self::Col> {
        Ok(MemCol(Arc::new(RwLock::new(BTreeMap::new()))))
    }
}

#[derive(Debug, Default)]
pub struct MemBatch {
    upsert_ops: Vec<(KeyBytes, ValueBytes)>,
    remove_ops: Vec<KeyBytes>,
}

impl BackendBatch for MemBatch {
    fn upsert(&mut self, k: &[u8], v: &[u8]) {
        self.upsert_ops.push((k.into(), v.into()));
    }

    fn remove(&mut self, k: &[u8]) {
        self.remove_ops.push(k.into());
    }
}

#[derive(Clone, Debug)]
pub struct MemCol(ArcSharedMap);

impl BackendCol for MemCol {
    type Batch = MemBatch;
    type KeyBytes = KeyBytes;
    type ValueBytes = ValueBytes;
    type Iter = MemIter;

    #[inline(always)]
    fn new_batch() -> Self::Batch {
        MemBatch::default()
    }
    #[inline(always)]
    fn clear(&self) -> KvResult<()> {
        let mut writer = self.0.write();
        writer.clear();
        Ok(())
    }
    #[inline(always)]
    fn count(&self) -> KvResult<usize> {
        let reader = self.0.read();
        Ok(reader.len())
    }
    #[inline(always)]
    fn get<K: Key, V: Value>(&self, k: &K) -> KvResult<Option<V>> {
        k.as_bytes(|k_bytes| {
            let reader = self.0.read();
            reader
                .get(k_bytes)
                .map(|bytes| {
                    V::from_bytes(&bytes).map_err(|e| KvError::DeserError(format!("{}", e)))
                })
                .transpose()
        })
    }
    #[inline(always)]
    fn delete<K: Key>(&self, k: &K) -> KvResult<()> {
        k.as_bytes(|k_bytes| {
            let mut writer = self.0.write();
            writer.remove(k_bytes)
        });
        Ok(())
    }
    #[inline(always)]
    fn put<K: Key, V: Value>(&self, k: &K, value: &V) -> KvResult<()> {
        value.as_bytes(|value_bytes| {
            k.as_bytes(|k_bytes| {
                let mut writer = self.0.write();
                writer.insert(k_bytes.into(), value_bytes.into());
            });
            Ok(())
        })
    }
    #[inline(always)]
    fn write_batch(&self, inner_batch: Self::Batch) -> KvResult<()> {
        let mut writer = self.0.write();
        for (k, v) in inner_batch.upsert_ops {
            writer.insert(k, v);
        }
        for k in inner_batch.remove_ops {
            writer.remove(&k);
        }
        Ok(())
    }
    #[inline(always)]
    fn iter<K: Key, V: Value>(&self, range: RangeBytes) -> Self::Iter {
        let map_shared_arc = self.0.clone();
        let map_shared_ref = map_shared_arc.as_ref();

        let reader = map_shared_ref.read();
        self.iter_inner(range, reader)
    }
    #[inline(always)]
    fn save(&self) -> KvResult<()> {
        Ok(())
    }
}

impl MemCol {
    fn iter_inner(
        &self,
        range: RangeBytes,
        reader: RwLockReadGuard<BTreeMap<KeyBytes, ValueBytes>>,
    ) -> MemIter {
        let reader = unsafe {
            std::mem::transmute::<
                RwLockReadGuard<BTreeMap<KeyBytes, ValueBytes>>,
                RwLockReadGuard<'static, BTreeMap<KeyBytes, ValueBytes>>,
            >(reader)
        };
        let reader_ref = unsafe {
            std::mem::transmute::<
                &RwLockReadGuard<BTreeMap<KeyBytes, ValueBytes>>,
                &'static RwLockReadGuard<'static, BTreeMap<KeyBytes, ValueBytes>>,
            >(&reader)
        };
        let iter = reader_ref.range(range);

        MemIter {
            col: self.clone(),
            reader: Some(reader),
            iter,
            reversed: false,
        }
    }
}

pub struct MemIter {
    #[allow(dead_code)]
    // Needed for safety
    col: MemCol,
    #[allow(dead_code)]
    // Needed for safety
    reader: Option<RwLockReadGuard<'static, BTreeMap<KeyBytes, ValueBytes>>>,
    iter: std::collections::btree_map::Range<'static, KeyBytes, ValueBytes>,
    reversed: bool,
}

impl Debug for MemIter {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MemIter").field("0", &"???").finish()
    }
}
impl Iterator for MemIter {
    type Item = Result<(KeyBytes, ValueBytes), DynErr>;

    #[inline(always)]
    fn next(&mut self) -> Option<Self::Item> {
        if self.reversed {
            self.iter.next_back()
        } else {
            self.iter.next()
        }
        .map(|(k, v)| Ok((k.to_owned(), v.to_owned())))
    }
}

impl ReversableIterator for MemIter {
    #[inline(always)]
    fn reverse(mut self) -> Self {
        self.reversed = !self.reversed;
        self
    }
}

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

//! KV Typed Backend Trait

#[cfg(feature = "leveldb_backend")]
pub mod leveldb;
#[cfg(target_arch = "x86_64")]
pub mod lmdb;
#[cfg(feature = "memory_backend")]
pub mod memory;
#[cfg(feature = "mock")]
pub mod mock;
#[cfg(feature = "sled_backend")]
pub mod sled;

use crate::*;

pub trait Backend: 'static + Clone + Sized {
    const NAME: &'static str;
    type Col: BackendCol;
    type Conf: Default;

    fn open(conf: &Self::Conf) -> KvResult<Self>;
    fn open_col(&mut self, conf: &Self::Conf, col_name: &str) -> KvResult<Self::Col>;
}

pub trait BackendCol: 'static + Clone + Debug + Send + Sync {
    type Batch: BackendBatch;
    type KeyBytes: KeyBytes;
    type ValueBytes: ValueBytes;
    type Iter: BackendIter<Self::KeyBytes, Self::ValueBytes>;

    fn get<K: Key, V: Value>(&self, k: &K) -> KvResult<Option<V>>;
    fn get_ref<K: Key, V: ValueZc, D, F: Fn(&V::Ref) -> KvResult<D>>(
        &self,
        k: &K,
        f: F,
    ) -> KvResult<Option<D>>;
    fn get_ref_slice<K: Key, V: ValueSliceZc, D, F: Fn(&[V::Elem]) -> KvResult<D>>(
        &self,
        k: &K,
        f: F,
    ) -> KvResult<Option<D>>;
    fn clear(&mut self) -> KvResult<()>;
    fn count(&self) -> KvResult<usize>;
    fn iter<K: Key, V: Value>(&self, range: RangeBytes) -> Self::Iter;
    fn put<K: Key, V: Value>(&mut self, k: &K, value: &V) -> KvResult<()>;
    fn delete<K: Key>(&mut self, k: &K) -> KvResult<()>;
    fn new_batch() -> Self::Batch;
    fn write_batch(&mut self, inner_batch: Self::Batch) -> KvResult<()>;
    fn save(&self) -> KvResult<()>;
}

pub trait BackendIter<K: KeyBytes, V: ValueBytes>:
    Iterator<Item = Result<(K, V), DynErr>> + ReversableIterator
{
}

#[cfg_attr(feature = "mock", mockall::automock)]
pub trait BackendBatch: Debug + Default {
    fn upsert(&mut self, k: &[u8], v: &[u8]);
    fn remove(&mut self, k: &[u8]);
}

#[cfg(feature = "mock")]
impl Debug for MockBackendBatch {
    fn fmt(&self, _f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        unimplemented!()
    }
}

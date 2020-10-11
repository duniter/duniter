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
#[cfg(feature = "memory_backend")]
pub mod memory;
#[cfg(feature = "mock")]
pub mod mock;
#[cfg(feature = "sled_backend")]
pub mod sled;

use crate::*;

pub trait TransactionalBackend<DbReader: From<Vec<Self::TxCol>>, DbWriter: From<Vec<Self::TxCol>>>:
    Backend
{
    type Err: Error + Send + Sync + 'static;
    type TxCol: BackendCol;

    fn read<A: Debug, D, F: Fn(&DbReader) -> TransactionResult<D, A, Self::Err>>(
        &self,
        f: F,
    ) -> TransactionResult<D, A, Self::Err>;
    fn write<A: Debug, F: Fn(&DbWriter) -> TransactionResult<(), A, Self::Err>>(
        &self,
        f: F,
    ) -> TransactionResult<(), A, Self::Err>;
}

pub trait Backend: 'static + Clone + Sized {
    const NAME: &'static str;
    type Col: BackendCol;
    type Conf: Default;

    fn open(conf: &Self::Conf) -> KvResult<Self>;
    fn open_col(&mut self, conf: &Self::Conf, col_name: &str) -> KvResult<Self::Col>;
}

pub trait BackendCol: 'static + Clone {
    type Batch: BackendBatch;
    type KeyBytes: AsRef<[u8]>;
    type ValueBytes: AsRef<[u8]>;
    type Iter: Iterator<Item = Result<(Self::KeyBytes, Self::ValueBytes), DynErr>>
        + ReversableIterator;

    fn get<K: Key, V: Value>(&self, k: &K) -> KvResult<Option<V>>;
    fn count(&self) -> KvResult<usize>;
    fn iter<K: Key, V: Value>(&self, range: RangeBytes) -> Self::Iter;
    fn put<K: Key, V: Value>(&self, k: &K, value: &V) -> KvResult<()>;
    fn delete<K: Key>(&self, k: &K) -> KvResult<()>;
    fn new_batch() -> Self::Batch;
    fn write_batch(&self, inner_batch: Self::Batch) -> KvResult<()>;
}

#[cfg_attr(feature = "mock", mockall::automock)]
pub trait BackendBatch: Default {
    fn upsert(&mut self, k: &[u8], v: &[u8]);
    fn remove(&mut self, k: &[u8]);
}

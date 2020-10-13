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

//! KV Typed mock backend

use super::MockBackendBatch;
use crate::*;

#[cfg(feature = "mock")]
mockall::mock! {
    pub BackendIter {}
    trait Iterator {
        type Item = Result<(Vec<u8>, Vec<u8>), DynErr>;

        fn next(&mut self) -> Option<<Self as Iterator>::Item>;
    }
    trait ReversableIterator {
        fn reverse(self) -> Self;
    }
}

#[cfg(feature = "mock")]
mockall::mock! {
    pub BackendCol {}
    trait Clone {
        fn clone(&self) -> Self;
    }
    trait BackendCol {
        type Batch = MockBackendBatch;
        type KeyBytes = Vec<u8>;
        type ValueBytes = Vec<u8>;
        type Iter = MockBackendIter;

        fn get<K: Key, V: Value>(&self, k: &K) -> KvResult<Option<V>>;
        fn clear(&self) -> KvResult<()>;
        fn count(&self) -> KvResult<usize>;
        fn iter<K: Key, V: Value>(&self, range: RangeBytes) -> MockBackendIter;
        fn put<K: Key, V: Value>(&self, k: &K, value: &V) -> KvResult<()>;
        fn delete<K: Key>(&self, k: &K) -> KvResult<()>;
        fn new_batch() -> MockBackendBatch;
        fn write_batch(&self, inner_batch: MockBackendBatch) -> KvResult<()>;
    }
}

#[cfg(feature = "mock")]
mockall::mock! {
    pub Backend {}
    trait Clone {
        fn clone(&self) -> Self;
    }
    trait Backend: 'static + Clone + Sized {
        const NAME: &'static str = "mock";
        type Col = MockBackendCol;
        type Conf = ();

        fn open(conf: &()) -> KvResult<Self>;
        fn open_col(&mut self, conf: &(), col_name: &str) -> KvResult<MockBackendCol>;
    }
}

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

//! KV Typed iterators

use crate::*;

#[derive(Debug)]
pub struct KvIterValues<
    C: BackendCol,
    KB: KeyBytes,
    VB: ValueBytes,
    BI: BackendIter<KB, VB>,
    K: Key,
    V: Value,
> {
    range_iter: super::range::RangeIter<C, KB, VB, BI>,
    phantom_key: PhantomData<K>,
    phantom_value: PhantomData<V>,
}

impl<C: BackendCol, KB: KeyBytes, VB: ValueBytes, BI: BackendIter<KB, VB>, K: Key, V: Value>
    Iterator for KvIterValues<C, KB, VB, BI, K, V>
{
    type Item = KvResult<V>;

    fn next(&mut self) -> Option<Self::Item> {
        match self.range_iter.next() {
            Some(Ok((_key_bytes, value_bytes))) => match V::from_bytes(value_bytes.as_ref()) {
                Ok(value) => Some(Ok(value)),
                Err(e) => Some(Err(KvError::DeserError(format!("{}", e)))),
            },
            Some(Err(e)) => Some(Err(KvError::BackendError(e))),
            None => None,
        }
    }
}

impl<C: BackendCol, KB: KeyBytes, VB: ValueBytes, BI: BackendIter<KB, VB>, K: Key, V: Value>
    ReversableIterator for KvIterValues<C, KB, VB, BI, K, V>
{
    #[inline(always)]
    fn reverse(self) -> Self {
        Self {
            range_iter: self.range_iter.reverse(),
            phantom_key: PhantomData,
            phantom_value: PhantomData,
        }
    }
}

impl<C: BackendCol, KB: KeyBytes, VB: ValueBytes, BI: BackendIter<KB, VB>, K: Key, V: Value>
    KvIterValues<C, KB, VB, BI, K, V>
{
    pub(super) fn new(range_iter: super::range::RangeIter<C, KB, VB, BI>) -> Self {
        Self {
            range_iter,
            phantom_key: PhantomData,
            phantom_value: PhantomData,
        }
    }
}

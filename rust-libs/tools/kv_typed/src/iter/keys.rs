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
pub struct KvIterKeys<C: BackendCol, K: Key> {
    range_iter: super::range::RangeIter<C>,
    phantom_key: PhantomData<K>,
}

impl<C: BackendCol, K: Key> Iterator for KvIterKeys<C, K> {
    type Item = KvResult<K>;

    fn next(&mut self) -> Option<Self::Item> {
        match self.range_iter.next() {
            Some(Ok((key_bytes, _value_bytes))) => match K::from_bytes(key_bytes.as_ref()) {
                Ok(key) => Some(Ok(key)),
                Err(e) => Some(Err(KvError::DeserError(format!("{}", e)))),
            },
            Some(Err(e)) => Some(Err(KvError::BackendError(e))),
            None => None,
        }
    }
}

impl<C: BackendCol, K: Key> ReversableIterator for KvIterKeys<C, K> {
    #[inline(always)]
    fn reverse(self) -> Self {
        Self {
            range_iter: self.range_iter.reverse(),
            phantom_key: PhantomData,
        }
    }
}

impl<C: BackendCol, K: Key> KvIterKeys<C, K> {
    pub(super) fn new(range_iter: super::range::RangeIter<C>) -> Self {
        Self {
            range_iter,
            phantom_key: PhantomData,
        }
    }
}

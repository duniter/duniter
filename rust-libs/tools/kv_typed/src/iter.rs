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

pub mod keys;
mod range;
pub mod values;

use crate::*;

pub trait ReversableIterator: Iterator + Sized {
    fn reverse(self) -> Self;

    #[inline(always)]
    fn last(self) -> Option<Self::Item> {
        self.reverse().next()
    }
}

pub trait ResultIter<T, E>: Iterator<Item = Result<T, E>> + Sized {
    #[inline(always)]
    fn next_res(&mut self) -> Result<Option<T>, E> {
        self.next().transpose()
    }
}
impl<I, T, E> ResultIter<T, E> for I where I: Iterator<Item = Result<T, E>> + Sized {}

pub type RangeBytes = (Bound<IVec>, Bound<IVec>);

#[derive(Debug)]
pub struct KvIter<C: BackendCol, K: Key, V: Value> {
    range_iter: range::RangeIter<C>,
    phantom_key: PhantomData<K>,
    phantom_value: PhantomData<V>,
}

impl<C: BackendCol, K: Key, V: Value> Iterator for KvIter<C, K, V> {
    type Item = KvResult<(K, V)>;

    fn next(&mut self) -> Option<Self::Item> {
        match self.range_iter.next() {
            Some(Ok((key_bytes, value_bytes))) => match K::from_bytes(key_bytes.as_ref()) {
                Ok(key) => match V::from_bytes(value_bytes.as_ref()) {
                    Ok(value) => Some(Ok((key, value))),
                    Err(e) => Some(Err(KvError::DeserError(format!("{}", e)))),
                },
                Err(e) => Some(Err(KvError::DeserError(format!("{}", e)))),
            },
            Some(Err(e)) => Some(Err(KvError::BackendError(e))),
            None => None,
        }
    }
}

impl<C: BackendCol, K: Key, V: Value> ReversableIterator for KvIter<C, K, V> {
    #[inline(always)]
    fn reverse(self) -> Self {
        Self {
            range_iter: self.range_iter.reverse(),
            phantom_key: PhantomData,
            phantom_value: PhantomData,
        }
    }
}

impl<C: BackendCol, K: Key, V: Value> KvIter<C, K, V> {
    pub fn keys(self) -> KvIterKeys<C, K> {
        KvIterKeys::new(self.range_iter)
    }
    pub fn values(self) -> KvIterValues<C, K, V> {
        KvIterValues::new(self.range_iter)
    }
    pub(crate) fn convert_range<RK: RangeBounds<K>>(range: RK) -> RangeBytes {
        let range_start = convert_bound(range.start_bound());
        let range_end = convert_bound(range.end_bound());
        (range_start, range_end)
    }
    #[cfg(feature = "mock")]
    pub fn new(backend_iter: C::Iter, range: RangeBytes) -> Self {
        Self {
            range_iter: range::RangeIter::new(backend_iter, range.0, range.1),
            phantom_key: PhantomData,
            phantom_value: PhantomData,
        }
    }
    #[cfg(not(feature = "mock"))]
    pub(crate) fn new(backend_iter: C::Iter, range: RangeBytes) -> Self {
        Self {
            range_iter: range::RangeIter::new(backend_iter, range.0, range.1),
            phantom_key: PhantomData,
            phantom_value: PhantomData,
        }
    }
}

#[inline(always)]
fn convert_bound<K: Key>(bound_key: Bound<&K>) -> Bound<IVec> {
    match bound_key {
        Bound::Included(key) => Bound::Included(key.as_bytes(|key_bytes| key_bytes.into())),
        Bound::Excluded(key) => Bound::Excluded(key.as_bytes(|key_bytes| key_bytes.into())),
        Bound::Unbounded => Bound::Unbounded,
    }
}

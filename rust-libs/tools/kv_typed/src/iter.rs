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
pub struct KvIter<
    C: BackendCol,
    KB: KeyBytes,
    VB: ValueBytes,
    BI: BackendIter<KB, VB>,
    K: Key,
    V: Value,
> {
    backend_iter: BI,
    phantom: PhantomData<(C, KB, VB, K, V)>,
}

impl<C: BackendCol, KB: KeyBytes, VB: ValueBytes, BI: BackendIter<KB, VB>, K: Key, V: Value>
    Iterator for KvIter<C, KB, VB, BI, K, V>
{
    type Item = KvResult<(K, V)>;

    fn next(&mut self) -> Option<Self::Item> {
        match self.backend_iter.next() {
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

impl<C: BackendCol, KB: KeyBytes, VB: ValueBytes, BI: BackendIter<KB, VB>, K: Key, V: Value>
    KvIter<C, KB, VB, BI, K, V>
{
    pub fn new(backend_iter: BI) -> Self {
        Self {
            backend_iter,
            phantom: PhantomData,
        }
    }
}

pub trait EntryIter {
    type K: Key;
    type V: Value;
    type KeysIter: Iterator<Item = KvResult<Self::K>>;
    type ValuesIter: Iterator<Item = KvResult<Self::V>>;

    fn keys(self) -> Self::KeysIter;
    fn values(self) -> Self::ValuesIter;
}

impl<C: BackendCol, KB: KeyBytes, VB: ValueBytes, BI: BackendIter<KB, VB>, K: Key, V: Value>
    EntryIter for KvIter<C, KB, VB, BI, K, V>
{
    type K = K;
    type V = V;
    type KeysIter = KvIterKeys<C, KB, VB, BI, K>;
    type ValuesIter = KvIterValues<C, KB, VB, BI, K, V>;

    fn keys(self) -> KvIterKeys<C, KB, VB, BI, K> {
        KvIterKeys::new(self.backend_iter)
    }
    fn values(self) -> KvIterValues<C, KB, VB, BI, K, V> {
        KvIterValues::new(self.backend_iter)
    }
}

pub(crate) fn convert_range<K: Key, RK: RangeBounds<K>>(range: RK) -> RangeBytes {
    let range_start = convert_bound(range.start_bound());
    let range_end = convert_bound(range.end_bound());
    (range_start, range_end)
}

#[inline(always)]
fn convert_bound<K: Key>(bound_key: Bound<&K>) -> Bound<IVec> {
    match bound_key {
        Bound::Included(key) => Bound::Included(key.as_bytes(|key_bytes| key_bytes.into())),
        Bound::Excluded(key) => Bound::Excluded(key.as_bytes(|key_bytes| key_bytes.into())),
        Bound::Unbounded => Bound::Unbounded,
    }
}

#[allow(dead_code, missing_debug_implementations)]
pub struct KvIterRefSlice<'db, BC, D, K, V, F, R>
where
    BC: BackendCol,
    K: KeyZc,
    V: ValueSliceZc,
    F: FnMut(&K::Ref, &[V::Elem]) -> KvResult<D>,
{
    pub(crate) inner: KvInnerIterRefSlice<BC, D, K, V, F>,
    pub(crate) reader: OwnedOrRef<'db, R>,
}
impl<'db, BC, D, K, V, F, R> Iterator for KvIterRefSlice<'db, BC, D, K, V, F, R>
where
    BC: BackendCol,
    K: KeyZc,
    V: ValueSliceZc,
    F: FnMut(&K::Ref, &[V::Elem]) -> KvResult<D>,
{
    type Item = KvResult<D>;

    fn next(&mut self) -> Option<Self::Item> {
        self.inner.next()
    }
}

#[allow(missing_debug_implementations)]
pub struct KvInnerIterRefSlice<BC, D, K, V, F>
where
    BC: BackendCol,
    K: KeyZc,
    V: ValueSliceZc,
    F: FnMut(&K::Ref, &[V::Elem]) -> KvResult<D>,
{
    pub(crate) backend_iter: BC::Iter,
    pub(crate) f: F,
    pub(crate) phantom: PhantomData<(D, K, V)>,
}
impl<BC, D, K, V, F> Iterator for KvInnerIterRefSlice<BC, D, K, V, F>
where
    BC: BackendCol,
    K: KeyZc,
    V: ValueSliceZc,
    F: FnMut(&K::Ref, &[V::Elem]) -> KvResult<D>,
{
    type Item = KvResult<D>;

    fn next(&mut self) -> Option<Self::Item> {
        match self.backend_iter.next() {
            Some(Ok((k_bytes, v_bytes))) => {
                if let Some(k_layout) = zerocopy::LayoutVerified::<_, K::Ref>::new(k_bytes.as_ref())
                {
                    if let Some(v_layout) = zerocopy::LayoutVerified::<_, [V::Elem]>::new_slice(
                        &v_bytes.as_ref()[V::prefix_len()..],
                    ) {
                        Some((self.f)(&k_layout, &v_layout))
                    } else {
                        Some(Err(KvError::DeserError(
                            "Bytes are invalid length or alignment.".into(),
                        )))
                    }
                } else {
                    Some(Err(KvError::DeserError(
                        "Bytes are invalid length or alignment.".into(),
                    )))
                }
            }
            Some(Err(e)) => Some(Err(KvError::BackendError(e))),
            None => None,
        }
    }
}

impl<BC, D, K, V, F> ReversableIterator for KvInnerIterRefSlice<BC, D, K, V, F>
where
    BC: BackendCol,
    K: KeyZc,
    V: ValueSliceZc,
    F: FnMut(&K::Ref, &[V::Elem]) -> KvResult<D>,
{
    #[inline(always)]
    fn reverse(self) -> Self {
        Self {
            backend_iter: self.backend_iter.reverse(),
            f: self.f,
            phantom: PhantomData,
        }
    }
}

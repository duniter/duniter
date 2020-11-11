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

#[derive(Clone, Copy, Debug)]
pub struct MemSingleton;

#[derive(Clone, Copy, Debug, Default)]
pub struct MemSingletonConf {
    phantom: PhantomData<()>,
}

type KeyBytes = IVec;
type ValueBytes = IVec;

impl Backend for MemSingleton {
    const NAME: &'static str = "mem_singleton";
    type Col = MemCol;
    type Conf = MemSingletonConf;

    fn open(_conf: &Self::Conf) -> KvResult<Self> {
        Ok(MemSingleton)
    }
    fn open_col(&mut self, _conf: &Self::Conf, _col_name: &str) -> KvResult<Self::Col> {
        Ok(MemCol(None))
    }
}

#[derive(Debug, Default)]
pub struct MemBatch(Option<IVec>);

impl BackendBatch for MemBatch {
    fn upsert(&mut self, _k: &[u8], v: &[u8]) {
        self.0 = Some(v.into());
    }

    fn remove(&mut self, _k: &[u8]) {
        self.0 = None;
    }
}

#[derive(Clone, Debug)]
pub struct MemCol(Option<ValueBytes>);

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
    fn clear(&mut self) -> KvResult<()> {
        self.0 = None;
        Ok(())
    }
    #[inline(always)]
    fn count(&self) -> KvResult<usize> {
        if self.0.is_some() {
            Ok(1)
        } else {
            Ok(0)
        }
    }
    #[inline(always)]
    fn get<K: Key, V: Value>(&self, _k: &K) -> KvResult<Option<V>> {
        self.0
            .as_ref()
            .map(|bytes| V::from_bytes(bytes).map_err(|e| KvError::DeserError(format!("{}", e))))
            .transpose()
    }
    #[inline(always)]
    fn get_ref<K: Key, V: ValueZc, D, F: Fn(&V::Ref) -> KvResult<D>>(
        &self,
        _k: &K,
        f: F,
    ) -> KvResult<Option<D>> {
        self.0
            .as_ref()
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
    }
    #[inline(always)]
    fn get_ref_slice<K: Key, V: ValueSliceZc, D, F: Fn(&[V::Elem]) -> KvResult<D>>(
        &self,
        _k: &K,
        f: F,
    ) -> KvResult<Option<D>> {
        self.0
            .as_ref()
            .map(|bytes| {
                if let Some(layout_verified) =
                    zerocopy::LayoutVerified::<_, [V::Elem]>::new_slice(&bytes[V::prefix_len()..])
                {
                    f(&layout_verified)
                } else {
                    Err(KvError::DeserError(
                        "Bytes are invalid length or alignment.".to_owned(),
                    ))
                }
            })
            .transpose()
    }
    #[inline(always)]
    fn delete<K: Key>(&mut self, _k: &K) -> KvResult<()> {
        self.0 = None;
        Ok(())
    }
    #[inline(always)]
    fn put<K: Key, V: Value>(&mut self, _k: &K, value: &V) -> KvResult<()> {
        value.as_bytes(|value_bytes| {
            self.0 = Some(value_bytes.into());
            Ok(())
        })
    }
    #[inline(always)]
    fn write_batch(&mut self, inner_batch: Self::Batch) -> KvResult<()> {
        self.0 = inner_batch.0;
        Ok(())
    }
    #[inline(always)]
    fn iter<K: Key, V: Value>(&self, _: RangeBytes) -> Self::Iter {
        MemIter(self.0.clone())
    }
    #[inline(always)]
    fn save(&self) -> KvResult<()> {
        Ok(())
    }
}

pub struct MemIter(Option<ValueBytes>);

impl Debug for MemIter {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MemIter").field("0", &"???").finish()
    }
}
impl Iterator for MemIter {
    type Item = Result<(KeyBytes, ValueBytes), DynErr>;

    #[inline(always)]
    fn next(&mut self) -> Option<Self::Item> {
        self.0.take().map(|v| Ok((KeyBytes::default(), v)))
    }
}

impl ReversableIterator for MemIter {
    #[inline(always)]
    fn reverse(self) -> Self {
        self
    }
}

impl BackendIter<IVec, IVec> for MemIter {}

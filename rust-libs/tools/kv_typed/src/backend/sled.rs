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

//! Sled backend for KV Typed,

pub use sled::Config;

use crate::*;

#[derive(Clone, Debug)]
pub struct Sled {
    db: sled::Db,
    trees: Vec<sled::Tree>,
}

impl Backend for Sled {
    const NAME: &'static str = "sled";
    type Col = SledCol;
    type Conf = Config;

    fn open(conf: &Self::Conf) -> KvResult<Self> {
        Ok(Sled {
            db: conf.open()?,
            trees: Vec::new(),
        })
    }
    fn open_col(&mut self, _conf: &Self::Conf, col_name: &str) -> KvResult<Self::Col> {
        let tree = self.db.open_tree(col_name)?;
        self.trees.push(tree.clone());
        Ok(SledCol(tree))
    }
}

impl BackendBatch for sled::Batch {
    fn upsert(&mut self, k: &[u8], v: &[u8]) {
        self.insert(k, v)
    }

    fn remove(&mut self, k: &[u8]) {
        self.remove(k)
    }
}

#[derive(Clone, Debug)]
pub struct SledCol(sled::Tree);

impl BackendCol for SledCol {
    type Batch = sled::Batch;
    type KeyBytes = IVec;
    type ValueBytes = IVec;
    type Iter = SledIter;

    #[inline(always)]
    fn new_batch() -> Self::Batch {
        sled::Batch::default()
    }
    #[inline(always)]
    fn clear(&mut self) -> KvResult<()> {
        self.0.clear()?;
        Ok(())
    }
    #[inline(always)]
    fn count(&self) -> KvResult<usize> {
        Ok(self.0.len())
    }
    #[inline(always)]
    fn get<K: Key, V: Value>(&self, k: &K) -> KvResult<Option<V>> {
        k.as_bytes(|k_bytes| {
            self.0
                .get(k_bytes)?
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
                .get(k_bytes)?
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
                .get(k_bytes)?
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
        k.as_bytes(|k_bytes| self.0.remove(k_bytes))?;
        Ok(())
    }
    #[inline(always)]
    fn put<K: Key, V: Value>(&mut self, k: &K, value: &V) -> KvResult<()> {
        value.as_bytes(|value_bytes| {
            k.as_bytes(|k_bytes| self.0.insert(k_bytes, value_bytes))?;
            Ok(())
        })
    }
    #[inline(always)]
    fn write_batch(&mut self, inner_batch: Self::Batch) -> KvResult<()> {
        self.0.apply_batch(inner_batch)?;
        Ok(())
    }
    #[inline(always)]
    fn iter<K: Key, V: Value>(&self, range: RangeBytes) -> Self::Iter {
        SledIter {
            iter: self.0.range(range),
            reversed: false,
        }
    }
    #[inline(always)]
    fn save(&self) -> KvResult<()> {
        self.0.flush()?;
        Ok(())
    }
}

pub struct SledIter {
    iter: sled::Iter,
    reversed: bool,
}

impl Debug for SledIter {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SledIter")
            .field("0", &"sled::Iter")
            .finish()
    }
}
impl Iterator for SledIter {
    type Item = Result<(IVec, IVec), DynErr>;

    #[inline(always)]
    fn next(&mut self) -> Option<Self::Item> {
        if self.reversed {
            self.iter.next_back()
        } else {
            self.iter.next()
        }
        .map(|res| res.map_err(Box::new).map_err(Into::into))
    }
}
impl ReversableIterator for SledIter {
    #[inline(always)]
    fn reverse(self) -> Self {
        SledIter {
            iter: self.iter,
            reversed: !self.reversed,
        }
    }
}

impl BackendIter<IVec, IVec> for SledIter {}

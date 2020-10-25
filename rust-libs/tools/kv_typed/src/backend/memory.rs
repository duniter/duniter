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
use std::collections::BTreeMap;
use uninit::extension_traits::VecCapacity as _;

#[derive(Clone, Copy, Debug)]
pub struct Mem;

#[derive(Clone, Debug, Default)]
pub struct MemConf {
    folder_path: Option<std::path::PathBuf>,
}

type KeyBytes = IVec;
type ValueBytes = IVec;
type Tree = BTreeMap<KeyBytes, ValueBytes>;

impl Backend for Mem {
    const NAME: &'static str = "mem";
    type Col = MemCol;
    type Conf = MemConf;

    fn open(_conf: &Self::Conf) -> KvResult<Self> {
        Ok(Mem)
    }
    fn open_col(&mut self, conf: &Self::Conf, col_name: &str) -> KvResult<Self::Col> {
        if let Some(ref folder_path) = conf.folder_path {
            MemCol::from_file(folder_path.join(col_name))
        } else {
            Ok(MemCol {
                path: None,
                tree: BTreeMap::new(),
            })
        }
    }
}

#[derive(Debug, Default)]
pub struct MemBatch {
    upsert_ops: Vec<(IVec, IVec)>,
    remove_ops: Vec<IVec>,
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
pub struct MemCol {
    path: Option<std::path::PathBuf>,
    tree: Tree,
}

impl MemCol {
    fn from_file(file_path: std::path::PathBuf) -> KvResult<Self> {
        let mut file = std::fs::File::open(file_path.as_path())?;
        let bytes = Vec::<u8>::new();
        if file.metadata()?.len() > 0 {
            let mut bytes = Vec::new();
            use std::io::Read as _;
            file.read_to_end(&mut bytes)?;
        }

        Ok(MemCol {
            path: Some(file_path),
            tree: Self::tree_from_bytes(&bytes)?,
        })
    }
    fn tree_from_bytes(bytes: &[u8]) -> KvResult<BTreeMap<IVec, IVec>> {
        let mut tree = BTreeMap::new();

        if bytes.len() < 32 {
            return Err(KvError::BackendError(
                StringErr("Corrupted tree".to_owned()).into(),
            ));
        } else {
            let hash = blake3::hash(&bytes[32..]);
            if hash.as_bytes() != &bytes[..32] {
                return Err(KvError::BackendError(
                    StringErr("Corrupted tree: wrong hash".to_owned()).into(),
                ));
            }
        };

        let mut len = 32;
        while len < bytes.len() {
            let len_add_4 = len + 4;
            if bytes.len() >= len_add_4 {
                let mut k_len = [0u8; 4];
                k_len.copy_from_slice(&bytes[len..len_add_4]);
                let k_len = u32::from_le_bytes(k_len);
                len = len_add_4 + k_len as usize;

                if bytes.len() >= len {
                    let k = IVec::from(&bytes[len_add_4..len]);

                    if bytes.len() >= len_add_4 {
                        let len_add_4 = len + 4;
                        let mut v_len = [0u8; 4];
                        v_len.copy_from_slice(&bytes[len..len_add_4]);
                        let v_len = u32::from_le_bytes(v_len);
                        len = len_add_4 + v_len as usize;

                        if bytes.len() >= len {
                            let v = IVec::from(&bytes[len_add_4..len]);

                            tree.insert(k, v);
                        } else {
                            return Err(KvError::BackendError(
                                StringErr("Corrupted tree".to_owned()).into(),
                            ));
                        }
                    } else {
                        return Err(KvError::BackendError(
                            StringErr("Corrupted tree".to_owned()).into(),
                        ));
                    }
                } else {
                    return Err(KvError::BackendError(
                        StringErr("Corrupted tree".to_owned()).into(),
                    ));
                }
            } else {
                return Err(KvError::BackendError(
                    StringErr("Corrupted tree".to_owned()).into(),
                ));
            }
        }

        Ok(tree)
    }
    fn tree_to_bytes(tree: &BTreeMap<IVec, IVec>) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(tree.len() * 20);
        let mut len = 32;
        for (k, v) in tree.iter() {
            // Write key len
            let k_len = (k.len() as u32).to_le_bytes();
            let len_add_4 = len + 4;
            bytes.reserve_uninit(4).r().copy_from_slice(&k_len[..]);
            unsafe {
                // # Safety
                //
                //   - `.copy_from_slice()` contract guarantees initialization
                //     of 4 additional bytes, which, in turn, from `reserve_uninit`'s contract,
                //     leads to the `vec` extra capacity having been initialized.
                bytes.set_len(len_add_4)
            }

            // Write key content
            bytes
                .reserve_uninit(k.len())
                .r()
                .copy_from_slice(k.as_ref());
            let new_len = len_add_4 + k.len();
            unsafe {
                // # Safety
                //
                //   - `.copy_from_slice()` contract guarantees initialization
                //     of `k.len()` additional bytes, which, in turn, from `reserve_uninit`'s contract,
                //     leads to the `vec` extra capacity having been initialized.
                bytes.set_len(new_len)
            }
            len = new_len;

            // Write value len
            let v_len = (v.len() as u32).to_le_bytes();
            let len_add_4 = len + 4;
            bytes.reserve_uninit(4).r().copy_from_slice(&v_len[..]);
            unsafe {
                // # Safety
                //
                //   - `.copy_from_slice()` contract guarantees initialization
                //     of 4 additional bytes, which, in turn, from `reserve_uninit`'s contract,
                //     leads to the `vec` extra capacity having been initialized.
                bytes.set_len(len_add_4)
            }

            // Write value content
            bytes
                .reserve_uninit(v.len())
                .r()
                .copy_from_slice(v.as_ref());
            let new_len = len_add_4 + v.len();
            unsafe {
                // # Safety
                //
                //   - `.copy_from_slice()` contract guarantees initialization
                //     of `v.len()` additional bytes, which, in turn, from `reserve_uninit`'s contract,
                //     leads to the `vec` extra capacity having been initialized.
                bytes.set_len(new_len)
            }
            len = new_len;
        }

        let hash = blake3::hash(&bytes[32..]);
        (&mut bytes[..32]).copy_from_slice(hash.as_bytes());

        bytes
    }
}

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
        self.tree.clear();
        Ok(())
    }
    #[inline(always)]
    fn count(&self) -> KvResult<usize> {
        Ok(self.tree.len())
    }
    #[inline(always)]
    fn get<K: Key, V: Value>(&self, k: &K) -> KvResult<Option<V>> {
        k.as_bytes(|k_bytes| {
            self.tree
                .get(k_bytes)
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
            self.tree
                .get(k_bytes)
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
            self.tree
                .get(k_bytes)
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
        k.as_bytes(|k_bytes| self.tree.remove(k_bytes));
        Ok(())
    }
    #[inline(always)]
    fn put<K: Key, V: Value>(&mut self, k: &K, value: &V) -> KvResult<()> {
        value.as_bytes(|value_bytes| {
            k.as_bytes(|k_bytes| {
                self.tree.insert(k_bytes.into(), value_bytes.into());
            });
            Ok(())
        })
    }
    #[inline(always)]
    fn write_batch(&mut self, inner_batch: Self::Batch) -> KvResult<()> {
        for (k, v) in inner_batch.upsert_ops {
            self.tree.insert(k, v);
        }
        for k in inner_batch.remove_ops {
            self.tree.remove(&k);
        }
        Ok(())
    }
    #[inline(always)]
    fn iter<K: Key, V: Value>(&self, range: RangeBytes) -> Self::Iter {
        MemIter::new(unsafe {
            // # Safety
            // On front API, the iterator is given to a closure executed inside of a `ColRo` method,
            // so that ensure borrowed tree keep alive
            std::mem::transmute(self.tree.range(range))
        })
    }
    #[inline(always)]
    fn save(&self) -> KvResult<()> {
        if let Some(ref file_path) = self.path {
            let bytes = Self::tree_to_bytes(&self.tree);

            let mut file =
                std::fs::File::create(file_path).map_err(|e| KvError::BackendError(e.into()))?;
            use std::io::Write as _;
            file.write_all(&bytes[..])
                .map_err(|e| KvError::BackendError(e.into()))?;
        }

        Ok(())
    }
}

pub struct MemIter {
    iter: std::collections::btree_map::Range<'static, KeyBytes, ValueBytes>,
    reversed: bool,
}

impl MemIter {
    fn new(
        tree_iter: std::collections::btree_map::Range<'static, KeyBytes, ValueBytes>,
    ) -> MemIter {
        MemIter {
            iter: tree_iter,
            reversed: false,
        }
    }
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

impl BackendIter<IVec, IVec> for MemIter {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_save() -> KvResult<()> {
        let mut tree = BTreeMap::new();

        let k1 = IVec::from(&[1, 2, 3]);
        let v1 = IVec::from(&[1, 2, 3, 4, 5]);
        let k2 = IVec::from(&[1, 2]);
        let v2 = IVec::from(&[]);
        let k3 = IVec::from(&[1, 2, 3, 4, 5, 6, 7]);
        let v3 = IVec::from(&[1, 2, 3, 4, 5, 6]);
        let k4 = IVec::from(&[]);
        let v4 = IVec::from(&[1, 2, 3, 4, 5, 6, 7]);

        tree.insert(k1.clone(), v1.clone());
        tree.insert(k2.clone(), v2.clone());
        tree.insert(k3.clone(), v3.clone());
        tree.insert(k4.clone(), v4.clone());

        let bytes = MemCol::tree_to_bytes(&tree);

        let tree2 = MemCol::tree_from_bytes(&bytes)?;

        assert_eq!(tree2.len(), 4);
        assert_eq!(tree2.get(&k1), Some(&v1));
        assert_eq!(tree2.get(&k2), Some(&v2));
        assert_eq!(tree2.get(&k3), Some(&v3));
        assert_eq!(tree2.get(&k4), Some(&v4));

        Ok(())
    }
}

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

use crate::*;
use std::collections::{BTreeMap, HashMap, HashSet};

#[derive(Debug)]
pub struct Batch<BC: BackendCol, C: DbCollectionRw> {
    phantom: PhantomData<BC>,
    pub(crate) tree: BTreeMap<IVec, Option<IVec>>,
    upsert_ops: HashMap<C::K, C::V>,
    delete_ops: HashSet<C::K>,
}

#[derive(Debug, PartialEq)]
pub enum BatchGet<'v, V: Value> {
    None,
    Deleted,
    Updated(&'v V),
}

impl<BC: BackendCol, C: DbCollectionRw> Default for Batch<BC, C> {
    fn default() -> Self {
        Batch {
            phantom: PhantomData,
            tree: BTreeMap::default(),
            upsert_ops: HashMap::default(),
            delete_ops: HashSet::default(),
        }
    }
}

impl<BC: BackendCol, C: DbCollectionRw> Batch<BC, C> {
    pub fn clear(&mut self) {
        self.tree.clear();
        self.upsert_ops.clear();
        self.delete_ops.clear();
    }
    pub fn get(&self, k: &C::K) -> BatchGet<C::V> {
        if self.delete_ops.contains(k) {
            BatchGet::Deleted
        } else if let Some(v) = self.upsert_ops.get(k) {
            BatchGet::Updated(v)
        } else {
            BatchGet::None
        }
    }
    pub fn upsert(&mut self, k: C::K, v: C::V) {
        let _ = k.as_bytes(|k_bytes| {
            v.as_bytes(|v_bytes| {
                self.tree
                    .insert(IVec::from(k_bytes), Some(IVec::from(v_bytes)));
                Ok(())
            })
        });
        self.upsert_ops.insert(k, v);
    }
    pub fn remove(&mut self, k: C::K) {
        let _ = k.as_bytes(|k_bytes| {
            self.tree.insert(IVec::from(k_bytes), None);
        });
        self.delete_ops.insert(k);
    }
    #[doc(hidden)]
    pub fn into_backend_batch(self) -> BC::Batch {
        let mut backend_batch = BC::Batch::default();
        for (k_bytes, v_bytes_opt) in self.tree {
            if let Some(v_bytes) = v_bytes_opt {
                backend_batch.upsert(k_bytes.as_ref(), v_bytes.as_ref());
            } else {
                backend_batch.remove(k_bytes.as_ref());
            }
        }
        backend_batch
    }
    #[doc(hidden)]
    pub fn into_backend_batch_and_events(self) -> (BC::Batch, SmallVec<[C::Event; 4]>) {
        let mut backend_batch = BC::Batch::default();
        for (k_bytes, v_bytes_opt) in self.tree {
            if let Some(v_bytes) = v_bytes_opt {
                backend_batch.upsert(k_bytes.as_ref(), v_bytes.as_ref());
            } else {
                backend_batch.remove(k_bytes.as_ref());
            }
        }
        let mut events: SmallVec<[C::Event; 4]> = self
            .upsert_ops
            .into_iter()
            .map(|(k, v)| C::Event::upsert(k, v))
            .collect();
        events.extend(self.delete_ops.into_iter().map(C::Event::remove));
        (backend_batch, events)
    }
}

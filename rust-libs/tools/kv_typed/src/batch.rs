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
use std::collections::{BTreeSet, HashMap, HashSet};

#[derive(Debug)]
pub struct Batch<BC: BackendCol, C: DbCollectionRw> {
    backend_batch: BC::Batch,
    upsert_keys_bytes: BTreeSet<IVec>,
    upsert_ops: HashMap<C::K, C::V>,
    delete_ops: HashSet<C::K>,
}

impl<BC: BackendCol, C: DbCollectionRw> Default for Batch<BC, C> {
    fn default() -> Self {
        Batch {
            backend_batch: BC::Batch::default(),
            upsert_keys_bytes: BTreeSet::default(),
            upsert_ops: HashMap::default(),
            delete_ops: HashSet::default(),
        }
    }
}

impl<BC: BackendCol, C: DbCollectionRw> Batch<BC, C> {
    pub fn get(&self, k: &C::K) -> Option<&C::V> {
        if self.delete_ops.contains(k) {
            None
        } else {
            self.upsert_ops.get(k)
        }
    }
    pub fn upsert(&mut self, k: C::K, v: C::V) {
        let _ = k.as_bytes(|k_bytes| {
            self.upsert_keys_bytes.insert(k_bytes.into());
            v.as_bytes(|v_bytes| {
                self.backend_batch.upsert(k_bytes, v_bytes);
                Ok(())
            })
        });
        self.upsert_ops.insert(k, v);
    }
    pub fn remove(&mut self, k: C::K) {
        let _ = k.as_bytes(|k_bytes| self.backend_batch.remove(k_bytes));
        self.delete_ops.insert(k);
    }
    #[cfg(not(feature = "subscription"))]
    pub fn into_backend_batch(self) -> BC::Batch {
        self.backend_batch
    }
    #[cfg(feature = "subscription")]
    pub fn into_backend_batch_and_events(self) -> (BC::Batch, SmallVec<[C::Event; 4]>) {
        let mut events: SmallVec<[C::Event; 4]> = self
            .upsert_ops
            .into_iter()
            .map(|(k, v)| C::Event::upsert(k, v))
            .collect();
        events.extend(self.delete_ops.into_iter().map(C::Event::remove));
        (self.backend_batch, events)
    }
}

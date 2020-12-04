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

//! KV Typed transactional iterator

use crate::*;
use std::collections::BTreeMap;

#[doc(hidden)]
#[derive(Debug)]
pub struct BackendTxIter<'b, BC: BackendCol> {
    batch_end_reached: bool,
    batch_iter: std::collections::btree_map::Iter<'b, IVec, Option<IVec>>,
    batch_tree_ref: &'b BTreeMap<IVec, Option<IVec>>,
    backend_iter: BC::Iter,
    db_end_reached: bool,
    next_batch_entry_opt: Option<(&'b IVec, &'b Option<IVec>)>,
    next_db_entry_opt: Option<(BC::KeyBytes, BC::ValueBytes)>,
    reverted: bool,
}

impl<'b, BC: BackendCol> BackendTxIter<'b, BC> {
    pub(crate) fn new(
        backend_iter: BC::Iter,
        batch_tree: &'b BTreeMap<IVec, Option<IVec>>,
    ) -> Self {
        Self {
            batch_end_reached: false,
            batch_iter: batch_tree.iter(),
            batch_tree_ref: batch_tree,
            backend_iter,
            db_end_reached: false,
            next_batch_entry_opt: None,
            next_db_entry_opt: None,
            reverted: false,
        }
    }
}

impl<'b, BC: BackendCol> BackendTxIter<'b, BC> {
    fn get_next_db_item(&mut self) -> Option<BackendResult<BC>> {
        match self.backend_iter.next() {
            Some(Ok(entry)) => {
                if self.batch_tree_ref.contains_key(entry.0.as_ref()) {
                    self.get_next_db_item()
                } else {
                    Some(Ok(entry))
                }
            }
            o => o,
        }
    }
}

#[allow(type_alias_bounds)]
type CowBytesEntry<'a, BC: BackendCol> = (CowKB<'a, BC::KeyBytes>, CowVB<'a, BC::ValueBytes>);

impl<'b, BC: BackendCol> Iterator for BackendTxIter<'b, BC> {
    type Item = Result<CowBytesEntry<'b, BC>, DynErr>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.next_batch_entry_opt.is_none() {
            self.next_batch_entry_opt = if self.reverted {
                self.batch_iter.next_back()
            } else {
                self.batch_iter.next()
            };
        }
        if self.next_batch_entry_opt.is_none() {
            self.batch_end_reached = true;
        }
        if self.next_db_entry_opt.is_none() {
            self.next_db_entry_opt = match self.get_next_db_item() {
                Some(Ok(entry)) => Some(entry),
                Some(Err(e)) => return Some(Err(e)),
                None => {
                    self.db_end_reached = true;
                    None
                }
            };
        }

        if self.batch_end_reached {
            if self.db_end_reached {
                None
            } else {
                // Return db item
                Some(Ok(self
                    .next_db_entry_opt
                    .take()
                    .map(|(k, v)| (CowKB::O(k), CowVB::O(v)))
                    .expect("unreachable")))
            }
        } else if self.db_end_reached {
            // Return batch item
            if let Some((k, v_opt)) = self.next_batch_entry_opt.take() {
                if let Some(v) = v_opt {
                    Some(Ok((CowKB::B(k.as_ref()), CowVB::B(v.as_ref()))))
                } else {
                    self.next()
                }
            } else {
                // batch_end_reached = false
                unreachable!()
            }
        } else if let Some((k_batch, v_batch_opt)) = self.next_batch_entry_opt.take() {
            if let Some((k_db, v_db)) = self.next_db_entry_opt.take() {
                if (!self.reverted && k_batch.as_ref() <= k_db.as_ref())
                    || (self.reverted && k_batch.as_ref() >= k_db.as_ref())
                {
                    self.next_db_entry_opt = Some((k_db, v_db));
                    // Return batch item
                    if let Some(v_batch) = v_batch_opt {
                        Some(Ok((CowKB::B(k_batch.as_ref()), CowVB::B(v_batch.as_ref()))))
                    } else {
                        self.next()
                    }
                } else {
                    self.next_batch_entry_opt = Some((k_batch, v_batch_opt));
                    // Return db item
                    Some(Ok((CowKB::O(k_db), CowVB::O(v_db))))
                }
            } else {
                // db_end_reached = false
                unreachable!()
            }
        } else {
            // batch_end_reached = false
            unreachable!()
        }
    }
}

impl<'b, BC: BackendCol> ReversableIterator for BackendTxIter<'b, BC> {
    fn reverse(mut self) -> Self {
        self.backend_iter = self.backend_iter.reverse();
        self.reverted = true;
        self
    }
}

impl<'b, BC: BackendCol> BackendIter<CowKB<'b, BC::KeyBytes>, CowVB<'b, BC::ValueBytes>>
    for BackendTxIter<'b, BC>
{
}

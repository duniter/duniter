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

//! KV Typed transactional write

pub(crate) mod tx_iter;

use crate::*;
use parking_lot::RwLockUpgradableReadGuard as UpgradableReadGuard;

pub struct TxColRw<'db, BC: BackendCol, E: EventTrait> {
    batch: &'static mut Batch<BC, ColRw<BC, E>>,
    col_reader: &'db UpgradableReadGuard<'db, ColInner<BC, E>>,
}
impl<'db, BC: BackendCol, E: EventTrait> Debug for TxColRw<'db, BC, E> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LevelDbCol")
            .field("batch", &format!("{:?}", self.batch))
            .field("col_reader", &format!("{:?}", self.col_reader))
            .finish()
    }
}

impl<'db, V: ValueZc, BC: BackendCol, E: EventTrait<V = V>> TxColRw<'db, BC, E> {
    pub fn get_ref<D, F: Fn(&V::Ref) -> KvResult<D>>(&self, k: &E::K, f: F) -> KvResult<Option<D>> {
        self.col_reader.backend_col.get_ref::<E::K, V, D, F>(k, f)
    }
}
impl<'db, V: ValueSliceZc, BC: BackendCol, E: EventTrait<V = V>> TxColRw<'db, BC, E> {
    pub fn get_ref_slice<D, F: Fn(&[V::Elem]) -> KvResult<D>>(
        &self,
        k: &E::K,
        f: F,
    ) -> KvResult<Option<D>> {
        self.col_reader
            .backend_col
            .get_ref_slice::<E::K, V, D, F>(k, f)
    }
}

impl<'db, BC: BackendCol, E: EventTrait> TxColRw<'db, BC, E> {
    /*type BackendCol = BC;
    type K = E::K;
    type V = E::V;
    type Event = E;*/

    #[inline(always)]
    pub fn count(&self) -> KvResult<usize> {
        self.col_reader.backend_col.count()
    }
    #[inline(always)]
    pub fn get(&self, k: &E::K) -> KvResult<Option<E::V>> {
        match self.batch.get(k) {
            batch::BatchGet::None => self.col_reader.backend_col.get(k),
            batch::BatchGet::Deleted => Ok(None),
            batch::BatchGet::Updated(v) => Ok(Some(v.as_bytes(|v_bytes| {
                E::V::from_bytes(v_bytes).map_err(|e| KvError::DeserError(format!("{}", e)))
            })?)),
        }
    }
    #[allow(clippy::type_complexity)]
    #[inline(always)]
    /// Don't worry about complex iter type. Use it like an `impl Iterator<Item=KvResult<(K, V)>>`.
    pub fn iter<'tx, D, R, F>(&'tx self, range: R, f: F) -> D
    where
        D: Send + Sync,
        R: 'static + RangeBounds<E::K>,
        F: FnOnce(
            KvIter<
                BC,
                CowKB<'tx, BC::KeyBytes>,
                CowVB<'tx, BC::ValueBytes>,
                BackendTxIter<BC>,
                E::K,
                E::V,
            >,
        ) -> D,
    {
        let range_bytes = crate::iter::convert_range::<E::K, R>(range);
        let backend_iter = self
            .col_reader
            .backend_col
            .iter::<E::K, E::V>(range_bytes.clone());
        f(KvIter::new(
            BackendTxIter::new(backend_iter, &self.batch.tree),
            range_bytes,
        ))
    }
    #[allow(clippy::type_complexity)]
    #[inline(always)]
    /// Don't worry about complex iter type. Use it like an `impl Iterator<Item=KvResult<(K, V)>>`.
    pub fn iter_rev<'tx, D, R, F>(&'tx self, range: R, f: F) -> D
    where
        D: Send + Sync,
        R: 'static + RangeBounds<E::K>,
        F: FnOnce(
            KvIter<
                BC,
                CowKB<'tx, BC::KeyBytes>,
                CowVB<'tx, BC::ValueBytes>,
                BackendTxIter<BC>,
                E::K,
                E::V,
            >,
        ) -> D,
    {
        let range_bytes = crate::iter::convert_range::<E::K, R>(range);
        let backend_iter = self
            .col_reader
            .backend_col
            .iter::<E::K, E::V>(range_bytes.clone());
        f(KvIter::new(
            BackendTxIter::new(backend_iter, &self.batch.tree),
            range_bytes,
        )
        .reverse())
    }
}

pub trait DbTxCollectionRw {
    type K: Key;
    type V: Value;
    type Event: EventTrait<K = Self::K, V = Self::V>;

    fn remove(&mut self, k: Self::K);
    fn upsert(&mut self, k: Self::K, v: Self::V);
}

impl<'db, BC: BackendCol, E: EventTrait> DbTxCollectionRw for TxColRw<'db, BC, E> {
    type K = E::K;
    type V = E::V;
    type Event = E;

    #[inline(always)]
    fn remove(&mut self, k: Self::K) {
        self.batch.remove(k)
    }
    #[inline(always)]
    fn upsert(&mut self, k: Self::K, v: Self::V) {
        self.batch.upsert(k, v)
    }
}

pub trait TransactionalWrite<'db, BC: BackendCol> {
    type TxCols;

    fn write<D, F: FnOnce(Self::TxCols) -> KvResult<D>>(&'db self, f: F) -> KvResult<D>;
}

impl<'db, BC: BackendCol, E: EventTrait> TransactionalWrite<'db, BC> for &'db ColRw<BC, E> {
    type TxCols = TxColRw<'db, BC, E>;

    fn write<D, F: FnOnce(Self::TxCols) -> KvResult<D>>(&'db self, f: F) -> KvResult<D> {
        let upgradable_guard = self.inner.inner.upgradable_read();

        let mut batch = Batch::<BC, ColRw<BC, E>>::default();

        let tx_col = TxColRw {
            batch: unsafe { std::mem::transmute(&mut batch) },
            col_reader: unsafe { std::mem::transmute(&upgradable_guard) },
        };
        let data = f(tx_col)?;

        // Prepare commit
        let (backend_batch, events) = batch.into_backend_batch_and_events();

        // Acquire exclusive lock
        let mut write_guard = UpgradableReadGuard::upgrade(upgradable_guard);

        // Commit
        self.write_backend_batch(backend_batch, events, &mut write_guard)?;

        Ok(data)
    }
}

macro_rules! impl_transactional_write {
    ($($i:literal),*) => {
        paste::paste! {
            impl<'db, BC: BackendCol $( ,[<E $i>]: EventTrait)*> TransactionalWrite<'db, BC>
                for ($(&'db ColRw<BC, [<E $i>]>, )*)
            {
                type TxCols = ($(TxColRw<'db, BC,  [<E $i>]>, )*);

                fn write<D, F: FnOnce(Self::TxCols) -> KvResult<D>>(
                    &'db self,
                    f: F,
                ) -> KvResult<D> {
                    $(let [<upgradable_guard_ $i>] = self.$i.inner.inner.upgradable_read();)*

                    $(let mut [<batch_ $i>] = Batch::<BC, ColRw<BC, [<E $i>]>>::default();)*

                    $(let [<tx_col $i>] = TxColRw {
                        batch: unsafe { std::mem::transmute(&mut [<batch_ $i>]) },
                        col_reader: unsafe { std::mem::transmute(&[<upgradable_guard_ $i>]) },
                    };)*

                    let data = f(($([<tx_col $i>], )*))?;

                    // Prepare commit
                    $(let ([<backend_batch_ $i>], [<events_ $i>]) = [<batch_ $i>].into_backend_batch_and_events();)*

                    // Acquire exclusive lock
                    $(let mut [<write_guard_ $i>] = UpgradableReadGuard::upgrade([<upgradable_guard_ $i>]);)*

                    // Commit
                    $(self.$i.write_backend_batch([<backend_batch_ $i>], [<events_ $i>], &mut [<write_guard_ $i>])?;)*

                    Ok(data)
                }
            }
        }
    };
}
impl_transactional_write!(0, 1);
impl_transactional_write!(0, 1, 2);
impl_transactional_write!(0, 1, 2, 3);
impl_transactional_write!(0, 1, 2, 3, 4);
impl_transactional_write!(0, 1, 2, 3, 4, 5);
impl_transactional_write!(0, 1, 2, 3, 4, 5, 6);
impl_transactional_write!(0, 1, 2, 3, 4, 5, 6, 7);
impl_transactional_write!(0, 1, 2, 3, 4, 5, 6, 7, 8);
impl_transactional_write!(0, 1, 2, 3, 4, 5, 6, 7, 8, 9);

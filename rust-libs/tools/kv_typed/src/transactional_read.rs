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

//! KV Typed transactional read

use crate::*;
use parking_lot::RwLockReadGuard as ReadGuard;

type TxColRoReader<'r, BC, E> = parking_lot::RwLockReadGuard<'r, ColInner<BC, E>>;

pub struct TxColRo<'tx, BC: BackendCol, E: EventTrait> {
    col_reader: ReadGuard<'tx, ColInner<BC, E>>,
}
impl<'tx, BC: BackendCol, E: EventTrait> Debug for TxColRo<'tx, BC, E> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LevelDbCol")
            .field("col_reader", &format!("{:?}", self.col_reader))
            .finish()
    }
}
impl<'tx, BC: BackendCol, E: EventTrait> TxColRo<'tx, BC, E> {
    #[inline(always)]
    fn new(col_reader: ReadGuard<'tx, ColInner<BC, E>>) -> Self {
        TxColRo { col_reader }
    }
    #[inline(always)]
    pub fn count(&self) -> KvResult<usize> {
        self.col_reader.backend_col.count()
    }
    #[inline(always)]
    pub fn get(&self, k: &E::K) -> KvResult<Option<E::V>> {
        self.col_reader.backend_col.get(k)
    }
    #[allow(clippy::type_complexity)]
    #[inline(always)]
    /// Don't worry about complex iter type. Use it like an `impl Iterator<Item=KvResult<(K, V)>>`.
    pub fn iter<D, R, F>(&self, range: R, f: F) -> D
    where
        D: Send + Sync,
        R: 'static + RangeBounds<E::K>,
        F: FnOnce(KvIter<BC, BC::KeyBytes, BC::ValueBytes, BC::Iter, E::K, E::V>) -> D,
    {
        let range_bytes = crate::iter::convert_range::<E::K, R>(range);
        let backend_iter = self.col_reader.backend_col.iter::<E::K, E::V>(range_bytes);
        f(KvIter::new(backend_iter))
    }
    #[allow(clippy::type_complexity)]
    #[inline(always)]
    /// Don't worry about complex iter type. Use it like an `impl Iterator<Item=KvResult<(K, V)>>`.
    pub fn iter_rev<D, R, F>(&self, range: R, f: F) -> D
    where
        D: Send + Sync,
        R: 'static + RangeBounds<E::K>,
        F: FnOnce(KvIter<BC, BC::KeyBytes, BC::ValueBytes, BC::Iter, E::K, E::V>) -> D,
    {
        let range_bytes = crate::iter::convert_range::<E::K, R>(range);
        let backend_iter = self
            .col_reader
            .backend_col
            .iter::<E::K, E::V>(range_bytes)
            .reverse();
        f(KvIter::new(backend_iter))
    }
}
impl<'tx, V: ValueZc, BC: BackendCol, E: EventTrait<V = V>> TxColRo<'tx, BC, E> {
    pub fn get_ref<D, F: Fn(&V::Ref) -> KvResult<D>>(&self, k: &E::K, f: F) -> KvResult<Option<D>> {
        self.col_reader.backend_col.get_ref::<E::K, V, D, F>(k, f)
    }
}
impl<'tx, K: KeyZc, V: ValueSliceZc, BC: BackendCol, E: EventTrait<K = K, V = V>>
    TxColRo<'tx, BC, E>
{
    pub fn iter_ref_slice<D, R, F>(
        &self,
        range: R,
        f: F,
    ) -> KvIterRefSlice<BC, D, K, V, F, TxColRoReader<BC, E>>
    where
        K: KeyZc,
        V: ValueSliceZc,
        R: 'static + RangeBounds<K>,
        F: FnMut(&K::Ref, &[V::Elem]) -> KvResult<D>,
    {
        let range: RangeBytes = crate::iter::convert_range::<K, R>(range);
        let inner_iter = self
            .col_reader
            .backend_col
            .iter_ref_slice::<D, K, V, F>(range, f);

        KvIterRefSlice {
            inner: inner_iter,
            reader: OwnedOrRef::Borrow(&self.col_reader),
        }
    }
    pub fn iter_ref_slice_rev<D, R, F>(
        &self,
        range: R,
        f: F,
    ) -> KvIterRefSlice<BC, D, K, V, F, TxColRoReader<BC, E>>
    where
        K: KeyZc,
        V: ValueSliceZc,
        R: 'static + RangeBounds<K>,
        F: FnMut(&K::Ref, &[V::Elem]) -> KvResult<D>,
    {
        let range: RangeBytes = crate::iter::convert_range::<K, R>(range);
        let inner_iter = self
            .col_reader
            .backend_col
            .iter_ref_slice::<D, K, V, F>(range, f)
            .reverse();

        KvIterRefSlice {
            inner: inner_iter,
            reader: OwnedOrRef::Borrow(&self.col_reader),
        }
    }
}

impl<'tx, V: ValueSliceZc, BC: BackendCol, E: EventTrait<V = V>> TxColRo<'tx, BC, E> {
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

pub trait TransactionalRead<'tx, BC: BackendCol> {
    type TxCols;

    fn read<D, F: Fn(Self::TxCols) -> KvResult<D>>(&'tx self, f: F) -> KvResult<D>;

    fn try_read<D, F: Fn(Self::TxCols) -> KvResult<D>>(&'tx self, f: F) -> Result<KvResult<D>, F>;
}

impl<'tx, BC: BackendCol, E: EventTrait> TransactionalRead<'tx, BC> for &'tx ColRo<BC, E> {
    type TxCols = TxColRo<'tx, BC, E>;

    fn read<D, F: Fn(Self::TxCols) -> KvResult<D>>(&'tx self, f: F) -> KvResult<D> {
        let read_guard_0 = self.inner.read();

        f(TxColRo::new(read_guard_0))
    }

    fn try_read<D, F: Fn(Self::TxCols) -> KvResult<D>>(&'tx self, f: F) -> Result<KvResult<D>, F> {
        if let Some(read_guard_0) = self.inner.try_read() {
            Ok(f(TxColRo::new(read_guard_0)))
        } else {
            Err(f)
        }
    }
}

macro_rules! impl_transactional_read {
    ($($i:literal),*) => {
        paste::paste! {
            impl<'tx, BC: BackendCol $( ,[<E $i>]: EventTrait)*> TransactionalRead<'tx, BC>
                for ($(&'tx ColRo<BC, [<E $i>]>, )*)
            {
                type TxCols = ($(TxColRo<'tx, BC,  [<E $i>]>, )*);

                fn read<D, F: Fn(Self::TxCols) -> KvResult<D>>(
                    &'tx self,
                    f: F,
                ) -> KvResult<D> {
                    $(let [<read_guard_ $i>] = self.$i.inner.read();)*

                    f(($(TxColRo::new([<read_guard_ $i>]), )*))
                }

                fn try_read<D, F: Fn(Self::TxCols) -> KvResult<D>>(
                    &'tx self,
                    f: F,
                ) -> Result<KvResult<D>, F> {
                    $(let [<read_guard_opt_ $i>] = self.$i.inner.try_read();)*

                    if $([<read_guard_opt_ $i>].is_none() || )* false {
                        Err(f)
                    } else {
                        Ok(f(($(TxColRo::new([<read_guard_opt_ $i>].expect("unreachable")), )*)))
                    }
                }
            }
        }
    };
}
impl_transactional_read!(0, 1);
impl_transactional_read!(0, 1, 2);
impl_transactional_read!(0, 1, 2, 3);
impl_transactional_read!(0, 1, 2, 3, 4);
impl_transactional_read!(0, 1, 2, 3, 4, 5);
impl_transactional_read!(0, 1, 2, 3, 4, 5, 6);
impl_transactional_read!(0, 1, 2, 3, 4, 5, 6, 7);
impl_transactional_read!(0, 1, 2, 3, 4, 5, 6, 7, 8);
impl_transactional_read!(0, 1, 2, 3, 4, 5, 6, 7, 8, 9);

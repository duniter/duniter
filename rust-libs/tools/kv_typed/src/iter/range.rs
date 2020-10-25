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

use crate::*;

pub(super) struct RangeIter<C: BackendCol, KB: KeyBytes, VB: ValueBytes, BI: BackendIter<KB, VB>> {
    backend_iter: BI,
    phantom: PhantomData<C>,
    phantom_kb: PhantomData<KB>,
    phantom_vb: PhantomData<VB>,
    reversed: bool,
    range_start: Bound<IVec>,
    range_end: Bound<IVec>,
}

impl<C: BackendCol, KB: KeyBytes, VB: ValueBytes, BI: BackendIter<KB, VB>> Debug
    for RangeIter<C, KB, VB, BI>
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LevelDbCol")
            .field("backend_iter", &"BackendIter")
            .field("reversed", &format!("{:?}", self.reversed))
            .field("range_start", &format!("{:?}", self.range_start))
            .field("range_end", &format!("{:?}", self.range_end))
            .finish()
    }
}

impl<C: BackendCol, KB: KeyBytes, VB: ValueBytes, BI: BackendIter<KB, VB>>
    RangeIter<C, KB, VB, BI>
{
    #[inline(always)]
    pub(crate) fn new(backend_iter: BI, range_start: Bound<IVec>, range_end: Bound<IVec>) -> Self {
        RangeIter {
            backend_iter,
            phantom: PhantomData,
            phantom_kb: PhantomData,
            phantom_vb: PhantomData,
            reversed: false,
            range_start,
            range_end,
        }
    }
}

impl<C: BackendCol, KB: KeyBytes, VB: ValueBytes, BI: BackendIter<KB, VB>> Iterator
    for RangeIter<C, KB, VB, BI>
{
    type Item = Result<(KB, VB), DynErr>;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            match self.backend_iter.next() {
                Some(Ok((key_bytes, value_bytes))) => {
                    let start_bound_ok = match &self.range_start {
                        Bound::Included(start_bytes) => key_bytes.as_ref() >= start_bytes.as_ref(),
                        Bound::Excluded(start_bytes) => key_bytes.as_ref() > start_bytes.as_ref(),
                        Bound::Unbounded => true,
                    };
                    let end_bound_ok = match &self.range_end {
                        Bound::Included(end_bytes) => key_bytes.as_ref() <= end_bytes.as_ref(),
                        Bound::Excluded(end_bytes) => key_bytes.as_ref() < end_bytes.as_ref(),
                        Bound::Unbounded => true,
                    };
                    if start_bound_ok {
                        if end_bound_ok {
                            break Some(Ok((key_bytes, value_bytes)));
                        } else if self.reversed {
                            // The interval has not yet begun.
                            continue;
                        } else {
                            // The range has been fully traversed, the iterator is finished.
                            break None;
                        }
                    } else if end_bound_ok {
                        if self.reversed {
                            // The range has been fully traversed, the iterator is finished.
                            break None;
                        } else {
                            // The interval has not yet begun.
                            continue;
                        }
                    } else {
                        // Empty range, the iterator is finished.
                        break None;
                    }
                }
                other => break other,
            }
        }
    }
}
impl<C: BackendCol, KB: KeyBytes, VB: ValueBytes, BI: BackendIter<KB, VB>> ReversableIterator
    for RangeIter<C, KB, VB, BI>
{
    #[inline(always)]
    fn reverse(self) -> Self {
        RangeIter {
            backend_iter: self.backend_iter.reverse(),
            phantom: PhantomData,
            phantom_kb: PhantomData,
            phantom_vb: PhantomData,
            reversed: !self.reversed,
            range_start: self.range_start,
            range_end: self.range_end,
        }
    }
}

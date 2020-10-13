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

//! KV Typed event

use crate::*;

/// Database events
pub type Events<E> = SmallVec<[E; 4]>;

/// Event trait
pub trait EventTrait: 'static + Debug + PartialEq + Send + Sync {
    type K: Key;
    type V: Value;

    fn clear() -> Self;
    fn upsert(k: Self::K, v: Self::V) -> Self;
    fn remove(k: Self::K) -> Self;
}

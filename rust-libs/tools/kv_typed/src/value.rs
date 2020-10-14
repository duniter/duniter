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

//! KV Typed Value trait

use crate::*;

/// Trait to be implemented by the collection value
#[cfg(not(feature = "explorer"))]
pub trait Value:
    'static + ValueAsBytes + Debug + FromBytes + PartialEq + Send + Sync + Sized
{
}

#[cfg(feature = "explorer")]
pub trait Value:
    'static + ValueAsBytes + Debug + ExplorableValue + FromBytes + PartialEq + Send + Sync + Sized
{
}

#[cfg(not(feature = "explorer"))]
impl<T> Value for T where
    T: 'static + ValueAsBytes + Debug + FromBytes + PartialEq + Send + Sync + Sized
{
}

#[cfg(feature = "explorer")]
impl<T> Value for T where
    T: 'static
        + ValueAsBytes
        + Debug
        + ExplorableValue
        + FromBytes
        + PartialEq
        + Send
        + Sync
        + Sized
{
}

pub trait ValueZc: Value {
    type Ref: Sized + zerocopy::AsBytes + zerocopy::FromBytes;
}

macro_rules! impl_value_zc_for_numbers {
    ($($T:ty),*) => {$(
        impl ValueZc for $T {
            type Ref = Self;
        }
    )*};
}

impl_value_zc_for_numbers!(
    usize, u8, u16, u32, u64, u128, isize, i8, i16, i32, i64, i128, f32, f64
);

pub trait ValueSliceZc: Value {
    type Elem: Sized + zerocopy::AsBytes + zerocopy::FromBytes;

    fn prefix_len() -> usize {
        8
    }
}

impl ValueSliceZc for String {
    type Elem = u8;

    fn prefix_len() -> usize {
        0
    }
}

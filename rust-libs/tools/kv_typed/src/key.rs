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

//! KV Typed Key trait

use crate::*;

/// Trait to be implemented by the collection key

#[cfg(not(feature = "explorer"))]
pub trait Key:
    'static + AsBytes + Debug + Eq + FromBytes + std::hash::Hash + Send + Sync + Sized
{
}

#[cfg(feature = "explorer")]
pub trait Key:
    'static + AsBytes + Debug + Eq + ExplorableKey + FromBytes + std::hash::Hash + Send + Sync + Sized
{
}

#[cfg(not(feature = "explorer"))]
impl<T> Key for T where
    T: 'static + AsBytes + Debug + Eq + FromBytes + std::hash::Hash + Send + Sync + Sized
{
}

#[cfg(feature = "explorer")]
impl<T> Key for T where
    T: 'static
        + AsBytes
        + Debug
        + Eq
        + ExplorableKey
        + FromBytes
        + std::hash::Hash
        + Send
        + Sync
        + Sized
{
}

pub trait KeyZc: Key {
    type Ref: Sized + zerocopy::AsBytes + zerocopy::FromBytes;
}

impl KeyZc for () {
    type Ref = ();
}

#[derive(
    Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd, zerocopy::AsBytes, zerocopy::FromBytes,
)]
#[repr(transparent)]
pub struct U32BE(pub u32);

impl From<&zerocopy::U32<byteorder::BigEndian>> for U32BE {
    fn from(u32_zc: &zerocopy::U32<byteorder::BigEndian>) -> Self {
        U32BE(u32_zc.get())
    }
}

impl KeyZc for U32BE {
    type Ref = zerocopy::U32<byteorder::BigEndian>;
}

#[derive(
    Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd, zerocopy::AsBytes, zerocopy::FromBytes,
)]
#[repr(transparent)]
pub struct U64BE(pub u64);

impl From<&zerocopy::U64<byteorder::BigEndian>> for U64BE {
    fn from(u32_zc: &zerocopy::U64<byteorder::BigEndian>) -> Self {
        U64BE(u32_zc.get())
    }
}

impl KeyZc for U64BE {
    type Ref = zerocopy::U64<byteorder::BigEndian>;
}

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

//! KV Typed bytes

use crate::*;

pub trait KeyBytes: AsRef<[u8]> + Debug + Ord {}
impl<T> KeyBytes for T where T: AsRef<[u8]> + Debug + Ord {}
pub trait ValueBytes: AsRef<[u8]> + Debug {}
impl<T> ValueBytes for T where T: AsRef<[u8]> + Debug {}

#[derive(Debug, Eq, PartialEq)]
pub enum CowKB<'a, B: KeyBytes> {
    B(&'a [u8]),
    O(B),
}
impl<'a, B: KeyBytes> AsRef<[u8]> for CowKB<'a, B> {
    fn as_ref(&self) -> &[u8] {
        match self {
            CowKB::B(b_ref) => b_ref,
            CowKB::O(b) => b.as_ref(),
        }
    }
}

impl<'a, B: KeyBytes> PartialOrd for CowKB<'a, B> {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        self.as_ref().partial_cmp(other.as_ref())
    }
}
impl<'a, B: KeyBytes> Ord for CowKB<'a, B> {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.as_ref().cmp(other.as_ref())
    }
}

#[derive(Debug)]
pub enum CowVB<'a, B: ValueBytes> {
    B(&'a [u8]),
    O(B),
}
impl<'a, B: ValueBytes> AsRef<[u8]> for CowVB<'a, B> {
    fn as_ref(&self) -> &[u8] {
        match self {
            CowVB::B(b_ref) => b_ref,
            CowVB::O(b) => b.as_ref(),
        }
    }
}

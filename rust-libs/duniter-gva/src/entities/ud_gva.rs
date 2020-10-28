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

#[derive(Clone, async_graphql::SimpleObject)]
pub(crate) struct CurrentUdGva {
    /// Ud amount
    pub(crate) amount: i64,
    /// Ud base
    pub(crate) base: i64,
}

#[derive(Clone, async_graphql::SimpleObject)]
pub(crate) struct RevalUdGva {
    /// Ud amount
    pub(crate) amount: i64,
    /// Ud base
    pub(crate) base: i64,
    /// Number of the block that revaluate ud amount
    pub(crate) block_number: u32,
}

#[derive(Clone, async_graphql::SimpleObject)]
pub(crate) struct UdGva {
    /// Ud amount
    pub(crate) amount: i64,
    /// Ud base
    pub(crate) base: i64,
    /// Issuer of this universal dividend
    pub(crate) issuer: String,
    /// Number of the block that created this UD
    pub(crate) block_number: u32,
}

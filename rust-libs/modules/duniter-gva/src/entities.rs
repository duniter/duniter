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

pub mod tx_gva;
pub mod ud_gva;

use crate::*;

#[derive(async_graphql::SimpleObject)]
pub(crate) struct TxsHistoryGva {
    /// Transactions sent
    pub(crate) sent: Vec<TxGva>,
    /// Transactions sending
    pub(crate) sending: Vec<TxGva>,
    /// Transactions received
    pub(crate) received: Vec<TxGva>,
    /// Transactions receiving
    pub(crate) receiving: Vec<TxGva>,
}

#[derive(Clone, async_graphql::SimpleObject)]
pub(crate) struct UtxoGva {
    /// Source amount
    pub(crate) amount: i64,
    /// Source base
    pub(crate) base: i64,
    /// Hash of origin transaction
    pub(crate) tx_hash: String,
    /// Index of output in origin transaction
    pub(crate) output_index: u32,
    /// Written time
    pub(crate) written_time: i64,
}

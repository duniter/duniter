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

use crate::*;
use dubp::documents::transaction::TransactionInputV10;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
pub struct PrepareSimplePayment {
    pub issuer: PublicKey,
    pub amount: Amount,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct PrepareSimplePaymentResp {
    pub current_block_number: u32,
    pub current_block_hash: Hash,
    pub current_ud: SourceAmount,
    pub inputs: Vec<TransactionInputV10>,
    pub inputs_sum: SourceAmount,
}

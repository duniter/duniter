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

#[derive(async_graphql::SimpleObject)]
pub(crate) struct TxGva {
    /// Version.
    pub version: i32,
    /// Currency.
    pub currency: String,
    /// Blockstamp
    pub blockstamp: String,
    /// Locktime
    pub locktime: u64,
    /// Document issuers.
    pub issuers: Vec<String>,
    /// Transaction inputs.
    pub inputs: Vec<String>,
    /// Inputs unlocks.
    pub unlocks: Vec<String>,
    /// Transaction outputs.
    pub outputs: Vec<String>,
    /// Transaction comment
    pub comment: String,
    /// Document signatures
    pub signatures: Vec<String>,
    /// Transaction hash
    pub hash: String,
    /// Written block
    pub written_block: Option<String>,
    /// Written Time
    pub written_time: Option<i64>,
}

impl From<TxDbV2> for TxGva {
    fn from(db_tx: TxDbV2) -> Self {
        let mut self_: TxGva = (&db_tx.tx).into();
        self_.written_block = Some(db_tx.written_block.to_string());
        self_.written_time = Some(db_tx.written_time);
        self_
    }
}

impl From<&TransactionDocumentV10> for TxGva {
    fn from(tx: &TransactionDocumentV10) -> Self {
        let tx_hash = tx.get_hash();
        let tx_stringified = tx.to_string_object();
        Self {
            version: 10,
            currency: tx_stringified.currency,
            blockstamp: tx_stringified.blockstamp,
            locktime: tx_stringified.locktime,
            issuers: tx_stringified.issuers,
            inputs: tx_stringified.inputs,
            unlocks: tx_stringified.unlocks,
            outputs: tx_stringified.outputs,
            comment: tx_stringified.comment,
            signatures: tx_stringified.signatures,
            hash: tx_hash.to_hex(),
            written_block: None,
            written_time: None,
        }
    }
}

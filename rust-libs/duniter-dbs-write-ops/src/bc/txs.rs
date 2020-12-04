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
use duniter_dbs::{
    bc_v2::{TxsHashsEvent, UdsEvent},
    UdIdV2,
};

pub(crate) fn apply_txs<B: Backend>(
    block_txs: &[TransactionDocumentV10],
    txs_hashs: &mut TxColRw<B::Col, TxsHashsEvent>,
    uds: &mut TxColRw<B::Col, UdsEvent>,
) -> KvResult<()> {
    for tx in block_txs {
        txs_hashs.upsert(HashKeyV2(tx.get_hash()), ());
        for input in tx.get_inputs() {
            if let SourceIdV10::Ud(UdSourceIdV10 {
                issuer,
                block_number,
            }) = input.id
            {
                uds.remove(UdIdV2(issuer, block_number));
            }
        }
    }
    Ok(())
}

pub(crate) fn revert_txs<B: Backend>(
    block_txs: &[TransactionDocumentV10],
    txs_hashs: &mut TxColRw<B::Col, TxsHashsEvent>,
    uds: &mut TxColRw<B::Col, UdsEvent>,
) -> KvResult<()> {
    for tx in block_txs {
        txs_hashs.remove(HashKeyV2(tx.get_hash()));
        for input in tx.get_inputs() {
            if let SourceIdV10::Ud(UdSourceIdV10 {
                issuer,
                block_number,
            }) = input.id
            {
                uds.upsert(UdIdV2(issuer, block_number), ());
            }
        }
    }
    Ok(())
}

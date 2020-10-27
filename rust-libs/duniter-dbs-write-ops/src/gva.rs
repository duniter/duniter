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

mod tx;
mod utxos;

use crate::*;

pub fn revert_block<B: Backend>(block: &DubpBlockV10, gva_db: &GvaV1Db<B>) -> KvResult<()> {
    for idty in block.identities() {
        let username = idty.username().to_owned();
        gva_db.uids_index_write().remove(username)?;
    }
    for tx in block.transactions() {
        let tx_hash = tx.get_hash();
        tx::revert_tx(gva_db, &tx_hash)?.ok_or_else(|| {
            KvError::DbCorrupted(format!("GVA: tx '{}' dont exist on txs history.", tx_hash,))
        })?;
    }

    Ok(())
}

pub fn apply_block<B: Backend>(block: &DubpBlockV10, gva_db: &GvaV1Db<B>) -> KvResult<()> {
    let blockstamp = Blockstamp {
        number: block.number(),
        hash: block.hash(),
    };
    for idty in block.identities() {
        let pubkey = idty.issuers()[0];
        let username = idty.username().to_owned();
        gva_db
            .uids_index_write()
            .upsert(username, PubKeyValV2(pubkey))?;
    }
    write_block_txs(
        &gva_db,
        blockstamp,
        block.common_time() as i64,
        block.transactions(),
    )?;

    Ok(())
}

fn write_block_txs<B: Backend>(
    gva_db: &GvaV1Db<B>,
    current_blockstamp: Blockstamp,
    current_time: i64,
    txs: &[TransactionDocumentV10],
) -> KvResult<()> {
    for tx in txs {
        let tx_hash = tx.get_hash();
        // Write tx and update sources
        tx::write_gva_tx(current_blockstamp, current_time, &gva_db, tx_hash, tx)?;
    }
    Ok(())
}

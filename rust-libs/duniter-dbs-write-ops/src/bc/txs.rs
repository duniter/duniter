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

use std::collections::HashMap;

use crate::*;
use dubp::documents::transaction::TransactionOutputV10;
use duniter_dbs::{
    databases::bc_v2::{ConsumedUtxosEvent, TxsHashsEvent, UdsEvent, UtxosEvent},
    BlockUtxosV2Db, UdIdV2, UtxoIdDbV2, WalletScriptWithSourceAmountV1Db,
};

pub(crate) fn apply_txs<B: Backend>(
    block_number: BlockNumber,
    block_txs: &[TransactionDocumentV10],
    txs_hashs: &mut TxColRw<B::Col, TxsHashsEvent>,
    uds: &mut TxColRw<B::Col, UdsEvent>,
    utxos: &mut TxColRw<B::Col, UtxosEvent>,
    consumed_utxos: &mut TxColRw<B::Col, ConsumedUtxosEvent>,
) -> KvResult<()> {
    if !block_txs.is_empty() {
        let mut block_consumed_utxos = HashMap::with_capacity(block_txs.len() * 3);
        for tx in block_txs {
            let tx_hash = tx.get_hash();
            txs_hashs.upsert(HashKeyV2(tx_hash), ());
            for input in tx.get_inputs() {
                match input.id {
                    SourceIdV10::Ud(UdSourceIdV10 {
                        issuer,
                        block_number,
                    }) => {
                        uds.remove(UdIdV2(issuer, block_number));
                    }
                    SourceIdV10::Utxo(utxo_id) => {
                        let utxo_id_db = UtxoIdDbV2(utxo_id.tx_hash, utxo_id.output_index as u32);
                        if let Some(wallet_script_with_sa) = utxos.get(&utxo_id_db)? {
                            utxos.remove(utxo_id_db);
                            block_consumed_utxos.insert(utxo_id, wallet_script_with_sa);
                        } else {
                            return Err(KvError::Custom(
                                format!("db corrupted: not found utxo {:?}", utxo_id_db).into(),
                            ));
                        }
                    }
                }
            }
            for (output_index, TransactionOutputV10 { amount, conditions }) in
                tx.get_outputs().iter().enumerate()
            {
                let utxo_id = UtxoIdDbV2(tx_hash, output_index as u32);
                let wallet_script_with_sa = WalletScriptWithSourceAmountV1Db {
                    wallet_script: conditions.script.clone(),
                    source_amount: *amount,
                };
                utxos.upsert(utxo_id, wallet_script_with_sa);
            }
        }
        if !block_consumed_utxos.is_empty() {
            consumed_utxos.upsert(U32BE(block_number.0), BlockUtxosV2Db(block_consumed_utxos));
        }
    }
    Ok(())
}

pub(crate) fn revert_txs<B: Backend>(
    block_number: BlockNumber,
    block_txs: &[TransactionDocumentV10],
    txs_hashs: &mut TxColRw<B::Col, TxsHashsEvent>,
    uds: &mut TxColRw<B::Col, UdsEvent>,
    utxos: &mut TxColRw<B::Col, UtxosEvent>,
    consumed_utxos: &mut TxColRw<B::Col, ConsumedUtxosEvent>,
) -> KvResult<()> {
    for tx in block_txs {
        let tx_hash = tx.get_hash();
        txs_hashs.remove(HashKeyV2(tx_hash));
        for input in tx.get_inputs() {
            match input.id {
                SourceIdV10::Ud(UdSourceIdV10 {
                    issuer,
                    block_number,
                }) => {
                    uds.upsert(UdIdV2(issuer, block_number), ());
                }
                SourceIdV10::Utxo(utxo_id) => {
                    let utxo_id_db = UtxoIdDbV2(utxo_id.tx_hash, utxo_id.output_index as u32);
                    if let Some(block_utxos) = consumed_utxos.get(&U32BE(block_number.0))? {
                        if let Some(wallet_script_with_sa) = block_utxos.0.get(&utxo_id) {
                            utxos.upsert(utxo_id_db, wallet_script_with_sa.clone());
                        } else {
                            return Err(KvError::Custom(
                                format!("db corrupted: not found consumed utxos {}", utxo_id)
                                    .into(),
                            ));
                        }
                    } else {
                        return Err(KvError::Custom(
                            format!("db corrupted: not found consumed utxos {:?}", utxo_id_db)
                                .into(),
                        ));
                    }
                }
            }
            if let SourceIdV10::Ud(UdSourceIdV10 {
                issuer,
                block_number,
            }) = input.id
            {
                uds.upsert(UdIdV2(issuer, block_number), ());
            }
        }
        for output_index in 0..tx.get_outputs().len() {
            let utxo_id = UtxoIdDbV2(tx_hash, output_index as u32);
            utxos.remove(utxo_id);
        }
    }
    consumed_utxos.remove(U32BE(block_number.0));
    Ok(())
}

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

pub fn apply_block<B: Backend>(
    block_txs: &[TransactionDocumentV10],
    txs_mp_db: &TxsMpV2Db<B>,
) -> KvResult<()> {
    for tx in block_txs {
        // Remove tx from mempool
        remove_one_pending_tx(&txs_mp_db, tx.get_hash())?;
    }
    Ok(())
}

pub fn revert_block<B: Backend>(
    block_txs: &[TransactionDocumentV10],
    txs_mp_db: &TxsMpV2Db<B>,
) -> KvResult<()> {
    for tx in block_txs {
        // Rewrite tx on mempool
        add_pending_tx(|_, _| Ok(()), txs_mp_db, Cow::Borrowed(tx))?;
    }
    Ok(())
}

pub fn add_pending_tx<
    B: Backend,
    F: FnOnce(
        &TransactionDocumentV10,
        &TxColRw<B::Col, duniter_dbs::databases::txs_mp_v2::TxsEvent>,
    ) -> KvResult<()>,
>(
    control: F,
    txs_mp_db: &TxsMpV2Db<B>,
    tx: Cow<TransactionDocumentV10>,
) -> KvResult<()> {
    let tx_hash = tx.get_hash();
    let received_time = chrono::offset::Utc::now().timestamp();
    (
        txs_mp_db.txs_by_recv_time_write(),
        txs_mp_db.txs_by_issuer_write(),
        txs_mp_db.txs_by_recipient_write(),
        txs_mp_db.txs_write(),
        txs_mp_db.uds_ids_write(),
        txs_mp_db.utxos_ids_write(),
        txs_mp_db.outputs_by_script_write(),
    )
        .write(
            |(
                mut txs_by_recv_time,
                mut txs_by_issuer,
                mut txs_by_recipient,
                mut txs,
                mut uds_ids,
                mut utxos_ids,
                mut outputs_by_script,
            )| {
                control(&tx, &txs)?;
                // Insert on col `txs_by_recv_time`
                let mut hashs = txs_by_recv_time.get(&received_time)?.unwrap_or_default();
                hashs.insert(tx_hash);
                txs_by_recv_time.upsert(received_time, hashs);
                // Insert on col `txs_by_issuer`
                for pubkey in tx.issuers() {
                    let mut hashs = txs_by_issuer.get(&PubKeyKeyV2(pubkey))?.unwrap_or_default();
                    hashs.insert(tx.get_hash());
                    txs_by_issuer.upsert(PubKeyKeyV2(pubkey), hashs);
                }
                // Insert on col `txs_by_recipient`
                for pubkey in tx.recipients_keys() {
                    let mut hashs = txs_by_recipient
                        .get(&PubKeyKeyV2(pubkey))?
                        .unwrap_or_default();
                    hashs.insert(tx.get_hash());
                    txs_by_recipient.upsert(PubKeyKeyV2(pubkey), hashs);
                }
                // Insert tx inputs in cols `uds_ids` and `utxos_ids`
                for input in tx.get_inputs() {
                    match input.id {
                        SourceIdV10::Ud(UdSourceIdV10 {
                            issuer,
                            block_number,
                        }) => uds_ids.upsert(duniter_dbs::UdIdV2(issuer, block_number), ()),
                        SourceIdV10::Utxo(UtxoIdV10 {
                            tx_hash,
                            output_index,
                        }) => utxos_ids
                            .upsert(duniter_dbs::UtxoIdDbV2(tx_hash, output_index as u32), ()),
                    }
                }
                // Insert tx outputs in col `outputs`
                for (output_index, output) in tx.get_outputs().iter().enumerate() {
                    let script = WalletConditionsV2(output.conditions.script.to_owned());
                    let utxo = UtxoValV2::new(output.amount, tx_hash, output_index as u32);
                    let mut script_outputs = outputs_by_script.get(&script)?.unwrap_or_default();
                    script_outputs.insert(utxo);
                    outputs_by_script.upsert(script, script_outputs);
                }
                // Insert tx itself
                txs.upsert(HashKeyV2(tx_hash), PendingTxDbV2(tx.into_owned()));
                Ok(())
            },
        )
}

pub fn remove_all_pending_txs<B: Backend>(txs_mp_db: &TxsMpV2Db<B>) -> KvResult<()> {
    txs_mp_db.txs_by_recv_time_write().clear()?;
    txs_mp_db.txs_by_issuer_write().clear()?;
    txs_mp_db.txs_by_recipient_write().clear()?;
    txs_mp_db.txs_write().clear()?;
    txs_mp_db.uds_ids_write().clear()?;
    txs_mp_db.utxos_ids_write().clear()?;

    Ok(())
}

pub fn remove_pending_tx_by_hash<B: Backend>(txs_mp_db: &TxsMpV2Db<B>, hash: Hash) -> KvResult<()> {
    remove_one_pending_tx(&txs_mp_db, hash)?;
    Ok(())
}

pub fn trim_expired_non_written_txs<B: Backend>(
    txs_mp_db: &TxsMpV2Db<B>,
    limit_time: i64,
) -> KvResult<()> {
    // Get hashs of tx to remove and "times" to remove
    let mut times = Vec::new();
    let hashs = txs_mp_db.txs_by_recv_time().iter(..limit_time, |it| {
        it.map_ok(|(k, v)| {
            times.push(k);
            v
        })
        .flatten_ok()
        .collect::<KvResult<SmallVec<[Hash; 4]>>>()
    })?;
    // For each tx to remove
    for (hash, time) in hashs.into_iter().zip(times.into_iter()) {
        remove_one_pending_tx(&txs_mp_db, hash)?;
        // Remove txs hashs in col `txs_by_recv_time`
        txs_mp_db.txs_by_recv_time_write().remove(time)?;
    }

    Ok(())
}

fn remove_one_pending_tx<B: Backend>(txs_mp_db: &TxsMpV2Db<B>, tx_hash: Hash) -> KvResult<bool> {
    if let Some(tx) = txs_mp_db.txs().get(&HashKeyV2(tx_hash))? {
        (
            txs_mp_db.txs_by_issuer_write(),
            txs_mp_db.txs_by_recipient_write(),
            txs_mp_db.txs_write(),
            txs_mp_db.uds_ids_write(),
            txs_mp_db.utxos_ids_write(),
            txs_mp_db.outputs_by_script_write(),
        )
            .write(
                |(
                    mut txs_by_issuer,
                    mut txs_by_recipient,
                    mut txs,
                    mut uds_ids,
                    mut utxos_ids,
                    mut outputs_by_script,
                )| {
                    // Remove tx inputs in cols `uds_ids` and `utxos_ids`
                    for input in tx.0.get_inputs() {
                        match input.id {
                            SourceIdV10::Ud(UdSourceIdV10 {
                                issuer,
                                block_number,
                            }) => uds_ids.remove(duniter_dbs::UdIdV2(issuer, block_number)),
                            SourceIdV10::Utxo(UtxoIdV10 {
                                tx_hash,
                                output_index,
                            }) => utxos_ids
                                .remove(duniter_dbs::UtxoIdDbV2(tx_hash, output_index as u32)),
                        }
                    }
                    // Remove tx hash in col `txs_by_issuer`
                    for pubkey in tx.0.issuers() {
                        let mut hashs_ =
                            txs_by_issuer.get(&PubKeyKeyV2(pubkey))?.unwrap_or_default();
                        hashs_.remove(&tx_hash);
                        txs_by_issuer.upsert(PubKeyKeyV2(pubkey), hashs_)
                    }
                    // Remove tx hash in col `txs_by_recipient`
                    for pubkey in tx.0.recipients_keys() {
                        let mut hashs_ = txs_by_recipient
                            .get(&PubKeyKeyV2(pubkey))?
                            .unwrap_or_default();
                        hashs_.remove(&tx_hash);
                        txs_by_recipient.upsert(PubKeyKeyV2(pubkey), hashs_)
                    }
                    // Remove tx outputs in col `outputs`
                    for (output_index, output) in tx.0.get_outputs().iter().enumerate() {
                        let script = WalletConditionsV2(output.conditions.script.to_owned());
                        let utxo = UtxoValV2::new(output.amount, tx_hash, output_index as u32);
                        let mut script_outputs =
                            outputs_by_script.get(&script)?.unwrap_or_default();
                        script_outputs.remove(&utxo);
                        outputs_by_script.upsert(script, script_outputs);
                    }
                    // Remove tx itself
                    txs.remove(HashKeyV2(tx_hash));
                    Ok(true)
                },
            )
    } else {
        Ok(false)
    }
}

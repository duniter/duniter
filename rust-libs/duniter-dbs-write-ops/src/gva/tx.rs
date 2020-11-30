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
use duniter_dbs::gva_v1::BalancesEvent;

pub(crate) type ScriptsHash = HashMap<WalletScriptV10, Hash>;

fn get_script_hash(script: &WalletScriptV10, scripts_hash: &mut ScriptsHash) -> Hash {
    if let Some(script_hash) = scripts_hash.get(script) {
        *script_hash
    } else {
        let script_hash = Hash::compute(script.to_string().as_bytes());
        scripts_hash.insert(script.clone(), script_hash);
        script_hash
    }
}

pub(crate) fn apply_tx<B: Backend>(
    current_blockstamp: Blockstamp,
    current_time: i64,
    gva_db: &GvaV1Db<B>,
    scripts_hash: &mut ScriptsHash,
    tx_hash: Hash,
    tx: &TransactionDocumentV10,
) -> KvResult<()> {
    (
        gva_db.scripts_by_pubkey_write(),
        gva_db.txs_by_issuer_write(),
        gva_db.txs_by_recipient_write(),
        gva_db.txs_write(),
        gva_db.gva_utxos_write(),
        gva_db.balances_write(),
    )
        .write(
            |(
                mut scripts_by_pubkey,
                mut txs_by_issuer,
                mut txs_by_recipient,
                mut txs,
                mut gva_utxos,
                mut balances,
            )| {
                // Insert on col `txs_by_issuer`
                for pubkey in tx.issuers() {
                    let mut hashs = txs_by_issuer.get(&PubKeyKeyV2(pubkey))?.unwrap_or_default();
                    hashs.push(tx_hash);
                    txs_by_issuer.upsert(PubKeyKeyV2(pubkey), hashs);
                }
                // Insert on col `txs_by_recipient`
                for pubkey in tx.recipients_keys() {
                    let mut hashs = txs_by_recipient
                        .get(&PubKeyKeyV2(pubkey))?
                        .unwrap_or_default();
                    hashs.push(tx_hash);
                    txs_by_recipient.upsert(PubKeyKeyV2(pubkey), hashs);
                }

                // Remove consumed UTXOs
                for input in tx.get_inputs() {
                    let account_script = match input.id {
                        SourceIdV10::Utxo(utxo_id) => {
                            let db_tx_origin = gva_db
                                .txs()
                                .get(&HashKeyV2::from_ref(&utxo_id.tx_hash))?
                                .ok_or_else(|| {
                                    KvError::DbCorrupted(format!(
                                        "Not found origin tx of uxto {}",
                                        utxo_id
                                    ))
                                })?;
                            let utxo_script = db_tx_origin.tx.get_outputs()[utxo_id.output_index]
                                .conditions
                                .script
                                .clone();
                            super::utxos::remove_utxo_v10::<B>(
                                &mut scripts_by_pubkey,
                                &mut gva_utxos,
                                utxo_id,
                                &utxo_script,
                                get_script_hash(&utxo_script, scripts_hash),
                                db_tx_origin.written_block.number.0,
                            )?;
                            utxo_script
                        }
                        SourceIdV10::Ud(UdSourceIdV10 { issuer, .. }) => {
                            WalletScriptV10::single_sig(issuer)
                        }
                    };
                    // Decrease account balance
                    decrease_account_balance::<B>(account_script, &mut balances, input.amount)?;
                }

                // Insert created UTXOs
                for (output_index, output) in tx.get_outputs().iter().enumerate() {
                    super::utxos::write_utxo_v10::<B>(
                        &mut scripts_by_pubkey,
                        &mut gva_utxos,
                        UtxoV10 {
                            id: UtxoIdV10 {
                                tx_hash,
                                output_index,
                            },
                            amount: output.amount,
                            script: &output.conditions.script,
                            written_block: current_blockstamp.number,
                        },
                        get_script_hash(&output.conditions.script, scripts_hash),
                    )?;

                    // Increase account balance
                    let balance = balances
                        .get(WalletConditionsV2::from_ref(&output.conditions.script))?
                        .unwrap_or_default();
                    balances.upsert(
                        WalletConditionsV2(output.conditions.script.clone()),
                        SourceAmountValV2(balance.0 + output.amount),
                    );
                }

                // Insert tx itself
                txs.upsert(
                    HashKeyV2(tx_hash),
                    TxDbV2 {
                        tx: tx.clone(),
                        written_block: current_blockstamp,
                        written_time: current_time,
                    },
                );

                Ok(())
            },
        )?;

    Ok(())
}

pub(crate) fn revert_tx<B: Backend>(
    block_number: BlockNumber,
    gva_db: &GvaV1Db<B>,
    scripts_hash: &mut ScriptsHash,
    tx_hash: &Hash,
) -> KvResult<Option<TransactionDocumentV10>> {
    if let Some(tx_db) = gva_db.txs().get(&HashKeyV2::from_ref(tx_hash))? {
        (
            gva_db.scripts_by_pubkey_write(),
            gva_db.txs_by_issuer_write(),
            gva_db.txs_by_recipient_write(),
            gva_db.txs_write(),
            gva_db.gva_utxos_write(),
            gva_db.balances_write(),
        )
            .write(
                |(
                    mut scripts_by_pubkey,
                    mut txs_by_issuer,
                    mut txs_by_recipient,
                    mut txs,
                    mut gva_utxos,
                    mut balances,
                )| {
                    // Remove UTXOs created by this tx
                    use dubp::documents::transaction::TransactionDocumentTrait as _;
                    for (output_index, output) in tx_db.tx.get_outputs().iter().enumerate() {
                        let script = &output.conditions.script;
                        super::utxos::remove_utxo_v10::<B>(
                            &mut scripts_by_pubkey,
                            &mut gva_utxos,
                            UtxoIdV10 {
                                tx_hash: *tx_hash,
                                output_index,
                            },
                            script,
                            get_script_hash(&script, scripts_hash),
                            block_number.0,
                        )?;
                        // Decrease account balance
                        decrease_account_balance::<B>(
                            script.clone(),
                            &mut balances,
                            output.amount,
                        )?;
                    }
                    // Recreate UTXOs consumed by this tx (and update balance)
                    for input in tx_db.tx.get_inputs() {
                        let account_script = match input.id {
                            SourceIdV10::Utxo(utxo_id) => {
                                let db_tx_origin = gva_db
                                    .txs()
                                    .get(&HashKeyV2::from_ref(&utxo_id.tx_hash))?
                                    .ok_or_else(|| {
                                        KvError::DbCorrupted(format!(
                                            "Not found origin tx of uxto {}",
                                            utxo_id
                                        ))
                                    })?;
                                let utxo_script = db_tx_origin.tx.get_outputs()
                                    [utxo_id.output_index]
                                    .conditions
                                    .script
                                    .clone();
                                super::utxos::write_utxo_v10::<B>(
                                    &mut scripts_by_pubkey,
                                    &mut gva_utxos,
                                    UtxoV10 {
                                        id: utxo_id,
                                        amount: input.amount,
                                        script: &utxo_script,
                                        written_block: db_tx_origin.written_block.number,
                                    },
                                    get_script_hash(&utxo_script, scripts_hash),
                                )?;
                                utxo_script
                            }
                            SourceIdV10::Ud(UdSourceIdV10 { issuer, .. }) => {
                                WalletScriptV10::single_sig(issuer)
                            }
                        };
                        // Increase account balance
                        let balance = balances
                            .get(WalletConditionsV2::from_ref(&account_script))?
                            .unwrap_or_default();

                        balances.upsert(
                            WalletConditionsV2(account_script),
                            SourceAmountValV2(balance.0 + input.amount),
                        );
                    }
                    // Remove tx
                    remove_tx::<B>(
                        &mut txs_by_issuer,
                        &mut txs_by_recipient,
                        &mut txs,
                        tx_hash,
                        &tx_db,
                    )?;
                    Ok(())
                },
            )?;

        Ok(Some(tx_db.tx))
    } else {
        Ok(None)
    }
}

fn remove_tx<B: Backend>(
    txs_by_issuer: &mut TxColRw<B::Col, TxsByIssuerEvent>,
    txs_by_recipient: &mut TxColRw<B::Col, TxsByRecipientEvent>,
    txs: &mut TxColRw<B::Col, TxsEvent>,
    tx_hash: &Hash,
    tx_db: &TxDbV2,
) -> KvResult<()> {
    // Remove tx hash in col `txs_by_issuer`
    for pubkey in tx_db.tx.issuers() {
        let mut hashs_ = txs_by_issuer.get(&PubKeyKeyV2(pubkey))?.unwrap_or_default();
        hashs_.pop();
        txs_by_issuer.upsert(PubKeyKeyV2(pubkey), hashs_)
    }
    // Remove tx hash in col `txs_by_recipient`
    for pubkey in tx_db.tx.recipients_keys() {
        let mut hashs_ = txs_by_recipient
            .get(&PubKeyKeyV2(pubkey))?
            .unwrap_or_default();
        hashs_.pop();
        txs_by_recipient.upsert(PubKeyKeyV2(pubkey), hashs_)
    }
    // Remove tx itself
    txs.remove(HashKeyV2(*tx_hash));
    Ok(())
}

fn decrease_account_balance<B: Backend>(
    account_script: WalletScriptV10,
    balances: &mut TxColRw<B::Col, BalancesEvent>,
    decrease_amount: SourceAmount,
) -> KvResult<()> {
    if let Some(SourceAmountValV2(balance)) =
        balances.get(WalletConditionsV2::from_ref(&account_script))?
    {
        let new_balance = balance - decrease_amount;
        if new_balance > SourceAmount::ZERO {
            balances.upsert(
                WalletConditionsV2(account_script),
                SourceAmountValV2(new_balance),
            );
        } else {
            balances.remove(WalletConditionsV2(account_script));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {

    use super::*;
    use dubp::{
        crypto::keys::ed25519::Ed25519KeyPair, crypto::keys::KeyPair as _,
        documents::smallvec::smallvec as svec, documents::transaction::v10::*,
        documents::transaction::UTXOConditions,
    };

    #[test]
    fn test_apply_tx() -> KvResult<()> {
        let kp = Ed25519KeyPair::generate_random().expect("gen rand kp");
        let kp2 = Ed25519KeyPair::generate_random().expect("gen rand kp");

        let ud0_amount = SourceAmount::with_base0(1000);
        let o1_amount = ud0_amount - SourceAmount::with_base0(600);
        let o2_amount = ud0_amount - SourceAmount::with_base0(400);

        let gva_db = duniter_dbs::gva_v1::GvaV1Db::<Mem>::open(MemConf::default())?;

        let b0 = BlockMetaV2 {
            dividend: Some(ud0_amount),
            ..Default::default()
        };
        let current_blockstamp = b0.blockstamp();
        let pk = kp.public_key();
        //println!("TMP pk1={}", pk);
        let pk2 = kp2.public_key();
        //println!("TMP pk2={}", pk2);
        let script = WalletScriptV10::single_sig(pk);
        let script2 = WalletScriptV10::single_sig(pk2);

        gva_db.balances_write().upsert(
            WalletConditionsV2(script.clone()),
            SourceAmountValV2(ud0_amount),
        )?;

        let tx1 = TransactionDocumentV10Builder {
            currency: "test",
            blockstamp: current_blockstamp,
            locktime: 0,
            issuers: svec![pk],
            inputs: &[TransactionInputV10 {
                amount: ud0_amount,
                id: SourceIdV10::Ud(UdSourceIdV10 {
                    issuer: pk,
                    block_number: BlockNumber(0),
                }),
            }],
            unlocks: &[TransactionInputUnlocksV10::default()],
            outputs: svec![
                TransactionOutputV10 {
                    amount: o1_amount,
                    conditions: UTXOConditions::from(script2.clone()),
                },
                TransactionOutputV10 {
                    amount: o2_amount,
                    conditions: UTXOConditions::from(script.clone()),
                }
            ],
            comment: "",
            hash: None,
        }
        .build_and_sign(vec![kp.generate_signator()]);
        let tx1_hash = tx1.get_hash();

        let mut scripts_hash = HashMap::new();
        apply_tx(
            current_blockstamp,
            b0.median_time as i64,
            &gva_db,
            &mut scripts_hash,
            tx1_hash,
            &tx1,
        )?;

        assert_eq!(
            gva_db
                .balances()
                .get(WalletConditionsV2::from_ref(&script2))?,
            Some(SourceAmountValV2(o1_amount))
        );
        assert_eq!(
            gva_db
                .balances()
                .get(WalletConditionsV2::from_ref(&script))?,
            Some(SourceAmountValV2(o2_amount))
        );

        let tx2 = TransactionDocumentV10Builder {
            currency: "test",
            blockstamp: current_blockstamp,
            locktime: 0,
            issuers: svec![pk2],
            inputs: &[TransactionInputV10 {
                amount: o1_amount,
                id: SourceIdV10::Utxo(UtxoIdV10 {
                    tx_hash: tx1_hash,
                    output_index: 0,
                }),
            }],
            unlocks: &[TransactionInputUnlocksV10::default()],
            outputs: svec![TransactionOutputV10 {
                amount: o1_amount,
                conditions: UTXOConditions::from(script.clone()),
            },],
            comment: "",
            hash: None,
        }
        .build_and_sign(vec![kp.generate_signator()]);
        let tx2_hash = tx2.get_hash();

        apply_tx(
            current_blockstamp,
            b0.median_time as i64,
            &gva_db,
            &mut scripts_hash,
            tx2_hash,
            &tx2,
        )?;

        assert_eq!(
            gva_db
                .balances()
                .get(WalletConditionsV2::from_ref(&script2))?,
            None
        );
        assert_eq!(
            gva_db
                .balances()
                .get(WalletConditionsV2::from_ref(&script))?,
            Some(SourceAmountValV2(ud0_amount))
        );

        revert_tx(
            current_blockstamp.number,
            &gva_db,
            &mut scripts_hash,
            &tx2_hash,
        )?;

        assert_eq!(
            gva_db
                .balances()
                .get(WalletConditionsV2::from_ref(&script2))?,
            Some(SourceAmountValV2(o1_amount))
        );
        assert_eq!(
            gva_db
                .balances()
                .get(WalletConditionsV2::from_ref(&script))?,
            Some(SourceAmountValV2(o2_amount))
        );

        revert_tx(
            current_blockstamp.number,
            &gva_db,
            &mut scripts_hash,
            &tx1_hash,
        )?;

        assert_eq!(
            gva_db
                .balances()
                .get(WalletConditionsV2::from_ref(&script2))?,
            None
        );
        assert_eq!(
            gva_db
                .balances()
                .get(WalletConditionsV2::from_ref(&script))?,
            Some(SourceAmountValV2(ud0_amount))
        );

        Ok(())
    }
}

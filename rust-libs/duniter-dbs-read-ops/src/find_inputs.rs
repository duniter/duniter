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
use dubp::{documents::transaction::TransactionInputV10, wallet::prelude::*};

pub fn find_inputs<BcDb: BcV2DbReadable, GvaDb: GvaV1DbReadable, TxsMpDb: TxsMpV2DbReadable>(
    bc_db: &BcDb,
    gva_db: &GvaDb,
    txs_mp_db: &TxsMpDb,
    amount: SourceAmount,
    script: &WalletScriptV10,
    use_mempool_sources: bool,
) -> KvResult<(BlockMetaV2, Vec<TransactionInputV10>, SourceAmount)> {
    if let Some(current_block) = crate::get_current_block_meta(bc_db)? {
        // Pending UTXOs
        let (mut inputs, mut inputs_sum) = if use_mempool_sources {
            txs_mp_db
                .outputs_by_script()
                .get_ref_slice(duniter_dbs::WalletConditionsV2::from_ref(script), |utxos| {
                    let mut sum = SourceAmount::ZERO;
                    let inputs = utxos
                        .iter()
                        .filter(|utxo| {
                            !txs_mp_db
                                .utxos_ids()
                                .contains_key(&UtxoIdDbV2(*utxo.tx_hash(), utxo.output_index()))
                                .unwrap_or(true)
                        })
                        .copied()
                        .map(|utxo| {
                            let amount = *utxo.amount();
                            sum = sum + amount;
                            TransactionInputV10 {
                                amount,
                                id: SourceIdV10::Utxo(UtxoIdV10 {
                                    tx_hash: *utxo.tx_hash(),
                                    output_index: utxo.output_index() as usize,
                                }),
                            }
                        })
                        .collect();

                    Ok((inputs, sum))
                })?
                .unwrap_or((Vec::with_capacity(50), SourceAmount::ZERO))
        } else {
            (Vec::with_capacity(50), SourceAmount::ZERO)
        };
        // UDs
        if script.nodes.is_empty() {
            if let WalletSubScriptV10::Single(WalletConditionV10::Sig(issuer)) = script.root {
                let pending_uds_bn = txs_mp_db.uds_ids().iter(.., |it| {
                    it.keys()
                        .map_ok(|duniter_dbs::UdIdV2(_pk, bn)| bn)
                        .collect::<KvResult<_>>()
                })?;

                let (uds, uds_sum) = crate::uds_of_pubkey::uds_of_pubkey(
                    bc_db,
                    issuer,
                    ..,
                    Some(&pending_uds_bn),
                    Some(amount - inputs_sum),
                )?;
                inputs.extend(uds.into_iter().map(|(block_number, source_amount)| {
                    TransactionInputV10 {
                        amount: source_amount,
                        id: SourceIdV10::Ud(UdSourceIdV10 {
                            issuer,
                            block_number,
                        }),
                    }
                }));
                inputs_sum = inputs_sum + uds_sum;
            }
        }
        if inputs_sum < amount {
            // Written UTXOs
            let (written_utxos, written_utxos_sum) =
                crate::utxos::find_script_utxos(gva_db, txs_mp_db, amount - inputs_sum, &script)?;
            inputs.extend(written_utxos.into_iter().map(
                |(_written_time, utxo_id, source_amount)| TransactionInputV10 {
                    amount: source_amount,
                    id: SourceIdV10::Utxo(utxo_id),
                },
            ));
            Ok((current_block, inputs, inputs_sum + written_utxos_sum))
        } else {
            Ok((current_block, inputs, inputs_sum))
        }
    } else {
        Err(KvError::Custom("no blockchain".into()))
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;
    use duniter_dbs::{
        bc_v2::BcV2DbWritable, gva_v1::GvaV1DbWritable, txs_mp_v2::TxsMpV2DbWritable,
        SourceAmountValV2, UdIdV2, UtxoIdDbV2, UtxoValV2, UtxosOfScriptV1, WalletConditionsV2,
    };

    const UD0: i64 = 10;

    #[test]
    fn test_find_inputs() -> KvResult<()> {
        let bc_db = duniter_dbs::bc_v2::BcV2Db::<Mem>::open(MemConf::default())?;
        let gva_db = duniter_dbs::gva_v1::GvaV1Db::<Mem>::open(MemConf::default())?;
        let txs_mp_db = duniter_dbs::txs_mp_v2::TxsMpV2Db::<Mem>::open(MemConf::default())?;

        let b0 = BlockMetaV2 {
            dividend: Some(SourceAmount::with_base0(UD0)),
            ..Default::default()
        };
        let pk = PublicKey::default();
        let script = WalletScriptV10::single(WalletConditionV10::Sig(pk));
        let mut pending_utxos = BTreeSet::new();
        pending_utxos.insert(UtxoValV2::new(
            SourceAmount::with_base0(90),
            Hash::default(),
            10,
        ));
        let mut written_utxos = BTreeMap::new();
        written_utxos.insert(
            0,
            smallvec::smallvec![
                (
                    UtxoIdV10 {
                        tx_hash: Hash::default(),
                        output_index: 0
                    },
                    SourceAmount::with_base0(50)
                ),
                (
                    UtxoIdV10 {
                        tx_hash: Hash::default(),
                        output_index: 1
                    },
                    SourceAmount::with_base0(80)
                )
            ],
        );

        bc_db.blocks_meta_write().upsert(U32BE(0), b0)?;
        bc_db
            .uds_reval_write()
            .upsert(U32BE(0), SourceAmountValV2(SourceAmount::with_base0(UD0)))?;
        bc_db
            .uds_write()
            .upsert(UdIdV2(PublicKey::default(), BlockNumber(0)), ())?;
        gva_db.utxos_by_script_write().upsert(
            WalletConditionsV2(script.clone()),
            UtxosOfScriptV1(written_utxos),
        )?;
        txs_mp_db
            .outputs_by_script_write()
            .upsert(WalletConditionsV2(script.clone()), pending_utxos)?;

        // Gen tx1
        let (cb, inputs, inputs_sum) = find_inputs(
            &bc_db,
            &gva_db,
            &txs_mp_db,
            SourceAmount::with_base0(55),
            &script,
            false,
        )?;
        assert_eq!(cb, b0);
        assert_eq!(inputs.len(), 2);
        assert_eq!(inputs_sum, SourceAmount::with_base0(60));

        // Insert tx1 inputs in mempool
        txs_mp_db
            .uds_ids_write()
            .upsert(UdIdV2(pk, BlockNumber(0)), ())?;
        txs_mp_db
            .utxos_ids_write()
            .upsert(UtxoIdDbV2(Hash::default(), 0), ())?;

        // Gen tx2
        let (cb, inputs, inputs_sum) = find_inputs(
            &bc_db,
            &gva_db,
            &txs_mp_db,
            SourceAmount::with_base0(55),
            &script,
            false,
        )?;
        assert_eq!(cb, b0);
        assert_eq!(inputs.len(), 1);
        assert_eq!(inputs_sum, SourceAmount::with_base0(80));

        // Insert tx2 inputs in mempool
        txs_mp_db
            .utxos_ids_write()
            .upsert(UtxoIdDbV2(Hash::default(), 1), ())?;

        // Gen tx3 (use pending utxo)
        let (cb, inputs, inputs_sum) = find_inputs(
            &bc_db,
            &gva_db,
            &txs_mp_db,
            SourceAmount::with_base0(75),
            &script,
            true,
        )?;
        assert_eq!(cb, b0);
        assert_eq!(inputs.len(), 1);
        assert_eq!(inputs_sum, SourceAmount::with_base0(90));

        Ok(())
    }
}

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

mod identities;
mod txs;
mod uds;

use crate::*;
use duniter_dbs::databases::bc_v2::BcV2DbWritable;

pub fn apply_block<B: Backend>(
    bc_db: &duniter_dbs::databases::bc_v2::BcV2Db<B>,
    block: &DubpBlockV10,
) -> KvResult<BlockMetaV2> {
    //log::info!("apply_block #{}", block.number().0);
    let block_meta = BlockMetaV2::from(block);

    (
        bc_db.blocks_meta_write(),
        bc_db.identities_write(),
        bc_db.txs_hashs_write(),
        bc_db.uds_write(),
        bc_db.uds_reval_write(),
        bc_db.uids_index_write(),
        bc_db.utxos_write(),
        bc_db.consumed_utxos_write(),
    )
        .write(
            |(
                mut blocks_meta,
                mut identities,
                mut txs_hashs,
                mut uds,
                mut uds_reval,
                mut uids_index,
                mut utxos,
                mut consumed_utxos,
            )| {
                blocks_meta.upsert(U32BE(block.number().0), block_meta);
                identities::update_identities::<B>(&block, &mut identities)?;
                for idty in block.identities() {
                    let pubkey = idty.issuers()[0];
                    let username = idty.username().to_owned();
                    uids_index.upsert(username, PubKeyValV2(pubkey));
                }
                if let Some(dividend) = block.dividend() {
                    uds::create_uds::<B>(
                        block.number(),
                        dividend,
                        &mut identities,
                        &mut uds,
                        &mut uds_reval,
                    )?;
                }
                txs::apply_txs::<B>(
                    block.number(),
                    block.transactions(),
                    &mut txs_hashs,
                    &mut uds,
                    &mut utxos,
                    &mut consumed_utxos,
                )?;
                Ok(())
            },
        )?;

    if block_meta.number > ROLL_BACK_MAX {
        prune_bc_db(bc_db, BlockNumber(block_meta.number))?;
    }

    Ok(block_meta)
}

fn prune_bc_db<B: Backend>(
    bc_db: &duniter_dbs::databases::bc_v2::BcV2Db<B>,
    current_block_number: BlockNumber,
) -> KvResult<()> {
    bc_db
        .consumed_utxos_write()
        .remove(U32BE(current_block_number.0 - ROLL_BACK_MAX))?;
    Ok(())
}

pub fn revert_block<B: Backend>(
    bc_db: &duniter_dbs::databases::bc_v2::BcV2Db<B>,
    block: &DubpBlockV10,
) -> KvResult<Option<BlockMetaV2>> {
    (
        bc_db.blocks_meta_write(),
        bc_db.identities_write(),
        bc_db.txs_hashs_write(),
        bc_db.uds_write(),
        bc_db.uds_reval_write(),
        bc_db.uids_index_write(),
        bc_db.utxos_write(),
        bc_db.consumed_utxos_write(),
    )
        .write(
            |(
                mut blocks_meta,
                mut identities,
                mut txs_hashs,
                mut uds,
                mut uds_reval,
                mut uids_index,
                mut utxos,
                mut consumed_utxos,
            )| {
                txs::revert_txs::<B>(
                    block.number(),
                    block.transactions(),
                    &mut txs_hashs,
                    &mut uds,
                    &mut utxos,
                    &mut consumed_utxos,
                )?;
                if block.dividend().is_some() {
                    uds::revert_uds::<B>(
                        block.number(),
                        &mut identities,
                        &mut uds,
                        &mut uds_reval,
                    )?;
                }
                identities::revert_identities::<B>(&block, &mut identities)?;
                for idty in block.identities() {
                    let username = idty.username().to_owned();
                    uids_index.remove(username);
                }
                blocks_meta.remove(U32BE(block.number().0));
                Ok(if block.number() == BlockNumber(0) {
                    None
                } else {
                    blocks_meta.get(&U32BE(block.number().0 - 1))?
                })
            },
        )
}

#[cfg(test)]
mod tests {
    use super::*;
    use dubp::{
        crypto::keys::{ed25519::PublicKey, PublicKey as _},
        documents::transaction::TransactionDocumentV10Stringified,
        documents_parser::prelude::FromStringObject,
    };
    use duniter_dbs::{
        databases::bc_v2::*, BlockUtxosV2Db, UtxoIdDbV2, WalletScriptWithSourceAmountV1Db,
    };
    use maplit::hashmap;

    #[test]
    fn test_bc_apply_block() -> anyhow::Result<()> {
        let bc_db = BcV2Db::<Mem>::open(MemConf::default())?;

        let s1 = WalletScriptV10::single_sig(PublicKey::from_base58(
            "D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx",
        )?);
        let s2 = WalletScriptV10::single_sig(PublicKey::from_base58(
            "4fHMTFBMo5sTQEc5p1CNWz28S4mnnqdUBmECq1zt4n2m",
        )?);

        let b0 = DubpBlockV10::from_string_object(&DubpBlockV10Stringified {
            version: 10,
            median_time: 5_243,
            dividend: Some(1000),
            joiners: vec!["D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx:FFeyrvYio9uYwY5aMcDGswZPNjGLrl8THn9l3EPKSNySD3SDSHjCljSfFEwb87sroyzJQoVzPwER0sW/cbZMDg==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:elois".to_owned()],
            inner_hash: Some("0000000A65A12DB95B3153BCD05DB4D5C30CC7F0B1292D9FFBC3DE67F72F6040".to_owned()),
            signature: "7B0hvcfajE2G8nBLp0vLVaQcQdQIyli21Gu8F2l+nimKHRe+fUNi+MWd1e/u29BYZa+RZ1yxhbHIbFzytg7fAA==".to_owned(),
            hash: Some("0000000000000000000000000000000000000000000000000000000000000000".to_owned()),
            ..Default::default()
        })?;

        apply_block(&bc_db, &b0)?;

        assert_eq!(bc_db.blocks_meta().count()?, 1);
        assert_eq!(bc_db.uds().count()?, 1);
        assert_eq!(bc_db.utxos().count()?, 0);
        assert_eq!(bc_db.consumed_utxos().count()?, 0);

        let b1 = DubpBlockV10::from_string_object(&DubpBlockV10Stringified {
            number: 1,
            version: 10,
            median_time: 5_245,
            transactions: vec![TransactionDocumentV10Stringified {
                currency: "test".to_owned(),
                blockstamp: "0-0000000000000000000000000000000000000000000000000000000000000000".to_owned(),
                locktime: 0,
                issuers: vec!["D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx".to_owned()],
                inputs: vec!["1000:0:D:D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx:0".to_owned()],
                unlocks: vec![],
                outputs: vec![
                    "600:0:SIG(4fHMTFBMo5sTQEc5p1CNWz28S4mnnqdUBmECq1zt4n2m)".to_owned(),
                    "400:0:SIG(D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx)".to_owned(),
                ],
                comment: "".to_owned(),
                signatures: vec![],
                hash: Some("0000000000000000000000000000000000000000000000000000000000000000".to_owned()),
            }],
            inner_hash: Some("0000000A65A12DB95B3153BCD05DB4D5C30CC7F0B1292D9FFBC3DE67F72F6040".to_owned()),
            signature: "7B0hvcfajE2G8nBLp0vLVaQcQdQIyli21Gu8F2l+nimKHRe+fUNi+MWd1e/u29BYZa+RZ1yxhbHIbFzytg7fAA==".to_owned(),
            hash: Some("0000000000000000000000000000000000000000000000000000000000000000".to_owned()),
            ..Default::default()
        })?;

        apply_block(&bc_db, &b1)?;

        assert_eq!(bc_db.blocks_meta().count()?, 2);
        assert_eq!(bc_db.uds().count()?, 0);
        assert_eq!(bc_db.utxos().count()?, 2);
        assert_eq!(
            bc_db
                .utxos()
                .iter(.., |it| it.collect::<KvResult<Vec<_>>>())?,
            vec![
                (
                    UtxoIdDbV2(Hash::default(), 0),
                    WalletScriptWithSourceAmountV1Db {
                        wallet_script: s2.clone(),
                        source_amount: SourceAmount::with_base0(600)
                    }
                ),
                (
                    UtxoIdDbV2(Hash::default(), 1),
                    WalletScriptWithSourceAmountV1Db {
                        wallet_script: s1.clone(),
                        source_amount: SourceAmount::with_base0(400)
                    }
                )
            ]
        );
        assert_eq!(bc_db.consumed_utxos().count()?, 0);

        let b2 = DubpBlockV10::from_string_object(&DubpBlockV10Stringified {
            number: 2,
            version: 10,
            median_time: 5_247,
            transactions: vec![TransactionDocumentV10Stringified {
                currency: "test".to_owned(),
                blockstamp: "0-0000000000000000000000000000000000000000000000000000000000000000".to_owned(),
                locktime: 0,
                issuers: vec!["D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx".to_owned()],
                inputs: vec!["400:0:T:0000000000000000000000000000000000000000000000000000000000000000:1".to_owned()],
                unlocks: vec![],
                outputs: vec![
                    "300:0:SIG(D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx)".to_owned(),
                    "100:0:SIG(4fHMTFBMo5sTQEc5p1CNWz28S4mnnqdUBmECq1zt4n2m)".to_owned(),
                ],
                comment: "".to_owned(),
                signatures: vec![],
                hash: Some("0101010101010101010101010101010101010101010101010101010101010101".to_owned()),
            }],
            inner_hash: Some("0000000A65A12DB95B3153BCD05DB4D5C30CC7F0B1292D9FFBC3DE67F72F6040".to_owned()),
            signature: "7B0hvcfajE2G8nBLp0vLVaQcQdQIyli21Gu8F2l+nimKHRe+fUNi+MWd1e/u29BYZa+RZ1yxhbHIbFzytg7fAA==".to_owned(),
            hash: Some("0000000000000000000000000000000000000000000000000000000000000000".to_owned()),
            ..Default::default()
        })?;

        apply_block(&bc_db, &b2)?;

        assert_eq!(bc_db.blocks_meta().count()?, 3);
        assert_eq!(bc_db.uds().count()?, 0);
        assert_eq!(bc_db.utxos().count()?, 3);
        assert_eq!(bc_db.consumed_utxos().count()?, 1);

        assert_eq!(
            bc_db
                .consumed_utxos()
                .iter(.., |it| it.collect::<KvResult<Vec<_>>>())?,
            vec![(
                U32BE(2),
                BlockUtxosV2Db(
                    hashmap![UtxoIdV10 { tx_hash: Hash::default(), output_index: 1 } => WalletScriptWithSourceAmountV1Db {
                        wallet_script: s1.clone(),
                        source_amount: SourceAmount::with_base0(400)
                    }]
                )
            )]
        );

        assert_eq!(
            bc_db
                .utxos()
                .iter(.., |it| it.collect::<KvResult<Vec<_>>>())?,
            vec![
                (
                    UtxoIdDbV2(Hash::default(), 0),
                    WalletScriptWithSourceAmountV1Db {
                        wallet_script: s2.clone(),
                        source_amount: SourceAmount::with_base0(600)
                    }
                ),
                (
                    UtxoIdDbV2(Hash([1; 32]), 0),
                    WalletScriptWithSourceAmountV1Db {
                        wallet_script: s1,
                        source_amount: SourceAmount::with_base0(300)
                    }
                ),
                (
                    UtxoIdDbV2(Hash([1; 32]), 1),
                    WalletScriptWithSourceAmountV1Db {
                        wallet_script: s2,
                        source_amount: SourceAmount::with_base0(100)
                    }
                )
            ]
        );

        Ok(())
    }
}

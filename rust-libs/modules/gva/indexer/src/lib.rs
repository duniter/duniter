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

#![deny(
    clippy::unwrap_used,
    missing_copy_implementations,
    trivial_casts,
    trivial_numeric_casts,
    unstable_features,
    unused_import_braces
)]

mod identities;
mod tx;
mod utxos;

use dubp::block::prelude::*;
use dubp::common::crypto::hashs::Hash;
use dubp::common::prelude::*;
use dubp::documents::{
    prelude::*, transaction::TransactionDocumentTrait, transaction::TransactionDocumentV10,
};
use dubp::wallet::prelude::*;
use duniter_dbs::{
    kv_typed::prelude::*, prelude::*, FileBackend, HashKeyV2, PubKeyKeyV2, SourceAmountValV2,
    WalletConditionsV2,
};
use duniter_gva_db::*;
use resiter::filter::Filter;
use std::{
    collections::{BTreeSet, HashMap},
    path::Path,
};

static GVA_DB_RO: once_cell::sync::OnceCell<GvaV1DbRo<FileBackend>> =
    once_cell::sync::OnceCell::new();
static GVA_DB_RW: once_cell::sync::OnceCell<GvaV1Db<FileBackend>> =
    once_cell::sync::OnceCell::new();

pub fn get_gva_db_ro(profile_path_opt: Option<&Path>) -> &'static GvaV1DbRo<FileBackend> {
    GVA_DB_RO.get_or_init(|| get_gva_db_rw(profile_path_opt).get_ro_handler())
}
pub fn get_gva_db_rw(profile_path_opt: Option<&Path>) -> &'static GvaV1Db<FileBackend> {
    GVA_DB_RW.get_or_init(|| {
        duniter_gva_db::GvaV1Db::<FileBackend>::open(FileBackend::gen_backend_conf(
            "gva_v1",
            profile_path_opt,
        ))
        .expect("Fail to open GVA DB")
    })
}

pub struct UtxoV10<'s> {
    pub id: UtxoIdV10,
    pub amount: SourceAmount,
    pub script: &'s WalletScriptV10,
    pub written_block: BlockNumber,
}

pub fn apply_block<B: Backend>(block: &DubpBlockV10, gva_db: &GvaV1Db<B>) -> KvResult<()> {
    let blockstamp = Blockstamp {
        number: block.number(),
        hash: block.hash(),
    };
    gva_db.write(|mut db| {
        db.blocks_by_common_time
            .upsert(U64BE(block.common_time()), block.number().0);
        db.blockchain_time
            .upsert(U32BE(block.number().0), block.common_time());
        identities::update_identities::<B>(&block, &mut db.gva_identities)?;
        if let Some(divident_amount) = block.dividend() {
            db.blocks_with_ud.upsert(U32BE(blockstamp.number.0), ());
            apply_ud::<B>(
                blockstamp.number,
                divident_amount,
                &mut db.balances,
                &mut db.gva_identities,
            )?;
        }
        apply_block_txs::<B>(
            &mut db,
            blockstamp,
            block.common_time() as i64,
            block.transactions(),
        )
    })?;

    Ok(())
}

pub fn revert_block<B: Backend>(block: &DubpBlockV10, gva_db: &GvaV1Db<B>) -> KvResult<()> {
    gva_db.write(|mut db| {
        db.blocks_by_common_time.remove(U64BE(block.common_time()));
        db.blockchain_time.remove(U32BE(block.number().0));
        identities::revert_identities::<B>(&block, &mut db.gva_identities)?;
        if let Some(divident_amount) = block.dividend() {
            db.blocks_with_ud.remove(U32BE(block.number().0));
            revert_ud::<B>(
                block.number(),
                divident_amount,
                &mut db.balances,
                &mut db.gva_identities,
            )?;
        }

        let mut scripts_hash = HashMap::with_capacity(block.transactions().len() * 3);
        for tx in block.transactions() {
            let tx_hash = tx.get_hash();
            tx::revert_tx::<B>(block.number(), &mut db, &mut scripts_hash, &tx_hash)?.ok_or_else(
                || {
                    KvError::DbCorrupted(format!(
                        "GVA: tx '{}' dont exist on txs history.",
                        tx_hash,
                    ))
                },
            )?;
        }
        db.txs_by_block.remove(U32BE(block.number().0));
        Ok(())
    })?;

    Ok(())
}

fn apply_ud<B: Backend>(
    block_number: BlockNumber,
    divident_amount: SourceAmount,
    balances: &mut TxColRw<B::Col, BalancesEvent>,
    identities: &mut TxColRw<B::Col, GvaIdentitiesEvent>,
) -> KvResult<()> {
    let members = identities.iter(.., |it| {
        it.filter_ok(|(_pk, idty)| idty.is_member)
            .collect::<KvResult<Vec<_>>>()
    })?;
    for (pk, mut idty) in members {
        if idty.first_ud.is_none() {
            idty.first_ud = Some(block_number);
            identities.upsert(pk, idty);
        }

        // Increase account balance
        let account_script = WalletScriptV10::single_sig(pk.0);
        let balance = balances
            .get(WalletConditionsV2::from_ref(&account_script))?
            .unwrap_or_default();
        balances.upsert(
            WalletConditionsV2(account_script),
            SourceAmountValV2(balance.0 + divident_amount),
        );
    }
    Ok(())
}

fn revert_ud<B: Backend>(
    block_number: BlockNumber,
    divident_amount: SourceAmount,
    balances: &mut TxColRw<B::Col, BalancesEvent>,
    identities: &mut TxColRw<B::Col, GvaIdentitiesEvent>,
) -> KvResult<()> {
    let members = identities.iter(.., |it| {
        it.filter_ok(|(_pk, idty)| idty.is_member)
            .collect::<KvResult<Vec<_>>>()
    })?;
    for (pk, mut idty) in members {
        if let Some(first_ud) = idty.first_ud {
            if first_ud == block_number {
                idty.first_ud = None;
                identities.upsert(pk, idty);
            }
        }

        // Increase account balance
        let account_script = WalletScriptV10::single_sig(pk.0);
        if let Some(SourceAmountValV2(balance)) =
            balances.get(WalletConditionsV2::from_ref(&account_script))?
        {
            balances.upsert(
                WalletConditionsV2(account_script),
                SourceAmountValV2(balance - divident_amount),
            );
        }
    }
    Ok(())
}

fn apply_block_txs<B: Backend>(
    gva_db: &mut GvaV1DbTxRw<B::Col>,
    current_blockstamp: Blockstamp,
    current_time: i64,
    txs: &[TransactionDocumentV10],
) -> KvResult<()> {
    let mut scripts_index = HashMap::new();
    let mut txs_by_issuer_mem = HashMap::new();
    let mut txs_by_recipient_mem = HashMap::new();
    let mut txs_hashes = Vec::with_capacity(txs.len());
    for tx in txs {
        let tx_hash = tx.get_hash();
        txs_hashes.push(tx_hash);
        // Write tx and update sources
        tx::apply_tx::<B>(
            current_blockstamp,
            current_time,
            gva_db,
            &mut scripts_index,
            tx_hash,
            tx,
            &mut txs_by_issuer_mem,
            &mut txs_by_recipient_mem,
        )?;
    }

    if !txs_hashes.is_empty() {
        gva_db
            .txs_by_block
            .upsert(U32BE(current_blockstamp.number.0), txs_hashes);
    }
    for (k, v) in txs_by_issuer_mem {
        gva_db.txs_by_issuer.upsert(k, v);
    }
    for (k, v) in txs_by_recipient_mem {
        gva_db.txs_by_recipient.upsert(k, v);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use dubp::{
        crypto::keys::{ed25519::PublicKey, PublicKey as _},
        documents::transaction::TransactionDocumentV10Stringified,
        documents_parser::prelude::FromStringObject,
    };

    #[test]
    fn test_gva_apply_block() -> anyhow::Result<()> {
        let gva_db = GvaV1Db::<Mem>::open(MemConf::default())?;

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

        apply_block(&b0, &gva_db)?;

        assert_eq!(gva_db.blocks_by_common_time().count()?, 1);
        assert_eq!(gva_db.blocks_by_common_time().get(&U64BE(5_243))?, Some(0));
        assert_eq!(gva_db.blockchain_time().count()?, 1);
        assert_eq!(gva_db.blockchain_time().get(&U32BE(0))?, Some(5_243));
        assert_eq!(gva_db.balances().count()?, 1);
        assert_eq!(
            gva_db.balances().get(&WalletConditionsV2(s1.clone()))?,
            Some(SourceAmountValV2(SourceAmount::with_base0(1000)))
        );
        assert_eq!(gva_db.txs_by_block().count()?, 0);

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

        apply_block(&b1, &gva_db)?;

        assert_eq!(gva_db.blocks_by_common_time().count()?, 2);
        assert_eq!(gva_db.blocks_by_common_time().get(&U64BE(5_245))?, Some(1));
        assert_eq!(gva_db.blockchain_time().count()?, 2);
        assert_eq!(gva_db.blockchain_time().get(&U32BE(1))?, Some(5_245));
        assert_eq!(gva_db.balances().count()?, 2);
        assert_eq!(
            gva_db.balances().get(&WalletConditionsV2(s2.clone()))?,
            Some(SourceAmountValV2(SourceAmount::with_base0(600)))
        );
        assert_eq!(
            gva_db.balances().get(&WalletConditionsV2(s1.clone()))?,
            Some(SourceAmountValV2(SourceAmount::with_base0(400)))
        );
        assert_eq!(gva_db.gva_utxos().count()?, 2);
        assert_eq!(
            gva_db
                .gva_utxos()
                .iter(.., |it| it.collect::<KvResult<Vec<_>>>())?,
            vec![
                (
                    GvaUtxoIdDbV1::new(s1.clone(), 1, Hash::default(), 1),
                    SourceAmountValV2(SourceAmount::with_base0(400))
                ),
                (
                    GvaUtxoIdDbV1::new(s2.clone(), 1, Hash::default(), 0),
                    SourceAmountValV2(SourceAmount::with_base0(600))
                ),
            ]
        );
        assert_eq!(gva_db.txs_by_block().count()?, 1);
        assert_eq!(
            gva_db.txs_by_block().get(&U32BE(1))?,
            Some(vec![Hash::from_hex(
                "0000000000000000000000000000000000000000000000000000000000000000"
            )?])
        );

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

        apply_block(&b2, &gva_db)?;

        assert_eq!(gva_db.blocks_by_common_time().count()?, 3);
        assert_eq!(gva_db.blocks_by_common_time().get(&U64BE(5_247))?, Some(2));
        assert_eq!(gva_db.blockchain_time().count()?, 3);
        assert_eq!(gva_db.blockchain_time().get(&U32BE(2))?, Some(5_247));
        assert_eq!(gva_db.balances().count()?, 2);
        assert_eq!(
            gva_db.balances().get(&WalletConditionsV2(s2.clone()))?,
            Some(SourceAmountValV2(SourceAmount::with_base0(700)))
        );
        assert_eq!(
            gva_db.balances().get(&WalletConditionsV2(s1.clone()))?,
            Some(SourceAmountValV2(SourceAmount::with_base0(300)))
        );
        assert_eq!(gva_db.gva_utxos().count()?, 3);
        assert_eq!(
            gva_db
                .gva_utxos()
                .iter(.., |it| it.collect::<KvResult<Vec<_>>>())?,
            vec![
                (
                    GvaUtxoIdDbV1::new(s1, 2, Hash([1; 32]), 0),
                    SourceAmountValV2(SourceAmount::with_base0(300))
                ),
                (
                    GvaUtxoIdDbV1::new(s2.clone(), 1, Hash::default(), 0),
                    SourceAmountValV2(SourceAmount::with_base0(600))
                ),
                (
                    GvaUtxoIdDbV1::new(s2, 2, Hash([1; 32]), 1),
                    SourceAmountValV2(SourceAmount::with_base0(100))
                ),
            ]
        );
        assert_eq!(gva_db.txs_by_block().count()?, 2);
        assert_eq!(
            gva_db.txs_by_block().get(&U32BE(2))?,
            Some(vec![Hash::from_hex(
                "0101010101010101010101010101010101010101010101010101010101010101"
            )?])
        );

        Ok(())
    }

    #[test]
    fn test_gva_revert_block() -> anyhow::Result<()> {
        let gva_db = GvaV1Db::<Mem>::open(MemConf::default())?;

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

        apply_block(&b0, &gva_db)?;

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

        apply_block(&b1, &gva_db)?;

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
                    "400:0:SIG(4fHMTFBMo5sTQEc5p1CNWz28S4mnnqdUBmECq1zt4n2m)".to_owned(),
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

        apply_block(&b2, &gva_db)?;

        let b3 = DubpBlockV10::from_string_object(&DubpBlockV10Stringified {
            number: 3,
            version: 10,
            median_time: 5_249,
            transactions: vec![TransactionDocumentV10Stringified {
                currency: "test".to_owned(),
                blockstamp: "0-0000000000000000000000000000000000000000000000000000000000000000".to_owned(),
                locktime: 0,
                issuers: vec!["4fHMTFBMo5sTQEc5p1CNWz28S4mnnqdUBmECq1zt4n2m".to_owned()],
                inputs: vec!["400:0:T:0101010101010101010101010101010101010101010101010101010101010101:0".to_owned()],
                unlocks: vec![],
                outputs: vec![
                    "400:0:SIG(D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx)".to_owned(),
                ],
                comment: "".to_owned(),
                signatures: vec![],
                hash: Some("0202020202020202020202020202020202020202020202020202020202020202".to_owned()),
            }],
            inner_hash: Some("0000000A65A12DB95B3153BCD05DB4D5C30CC7F0B1292D9FFBC3DE67F72F6040".to_owned()),
            signature: "7B0hvcfajE2G8nBLp0vLVaQcQdQIyli21Gu8F2l+nimKHRe+fUNi+MWd1e/u29BYZa+RZ1yxhbHIbFzytg7fAA==".to_owned(),
            hash: Some("0000000000000000000000000000000000000000000000000000000000000000".to_owned()),
            ..Default::default()
        })?;

        apply_block(&b3, &gva_db)?;

        revert_block(&b3, &gva_db)?;

        assert_eq!(gva_db.blockchain_time().count()?, 3);
        assert_eq!(gva_db.blockchain_time().get(&U32BE(2))?, Some(5_247));
        assert_eq!(gva_db.balances().count()?, 2);
        assert_eq!(
            gva_db.balances().get(&WalletConditionsV2(s1.clone()))?,
            Some(SourceAmountValV2(SourceAmount::ZERO))
        );
        assert_eq!(
            gva_db.balances().get(&WalletConditionsV2(s2.clone()))?,
            Some(SourceAmountValV2(SourceAmount::with_base0(1_000)))
        );
        assert_eq!(gva_db.gva_utxos().count()?, 2);
        assert_eq!(
            gva_db
                .gva_utxos()
                .iter(.., |it| it.collect::<KvResult<Vec<_>>>())?,
            vec![
                (
                    GvaUtxoIdDbV1::new(s2.clone(), 1, Hash::default(), 0),
                    SourceAmountValV2(SourceAmount::with_base0(600))
                ),
                (
                    GvaUtxoIdDbV1::new(s2.clone(), 2, Hash([1u8; 32]), 0),
                    SourceAmountValV2(SourceAmount::with_base0(400))
                ),
            ]
        );

        revert_block(&b2, &gva_db)?;

        assert_eq!(gva_db.blockchain_time().count()?, 2);
        assert_eq!(gva_db.blockchain_time().get(&U32BE(1))?, Some(5_245));
        assert_eq!(gva_db.balances().count()?, 2);
        assert_eq!(
            gva_db.balances().get(&WalletConditionsV2(s2.clone()))?,
            Some(SourceAmountValV2(SourceAmount::with_base0(600)))
        );
        assert_eq!(
            gva_db.balances().get(&WalletConditionsV2(s1.clone()))?,
            Some(SourceAmountValV2(SourceAmount::with_base0(400)))
        );
        assert_eq!(gva_db.gva_utxos().count()?, 2);
        assert_eq!(
            gva_db
                .gva_utxos()
                .iter(.., |it| it.collect::<KvResult<Vec<_>>>())?,
            vec![
                (
                    GvaUtxoIdDbV1::new(s1.clone(), 1, Hash::default(), 1),
                    SourceAmountValV2(SourceAmount::with_base0(400))
                ),
                (
                    GvaUtxoIdDbV1::new(s2.clone(), 1, Hash::default(), 0),
                    SourceAmountValV2(SourceAmount::with_base0(600))
                ),
            ]
        );

        revert_block(&b1, &gva_db)?;

        assert_eq!(gva_db.blockchain_time().count()?, 1);
        assert_eq!(gva_db.blockchain_time().get(&U32BE(0))?, Some(5_243));
        assert_eq!(gva_db.balances().count()?, 1);
        assert_eq!(
            gva_db.balances().get(&WalletConditionsV2(s1))?,
            Some(SourceAmountValV2(SourceAmount::with_base0(1000)))
        );
        assert_eq!(gva_db.balances().get(&WalletConditionsV2(s2))?, None);

        Ok(())
    }
}

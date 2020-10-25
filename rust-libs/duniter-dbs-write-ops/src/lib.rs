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

use std::borrow::Cow;

use crate::utxos::UtxoV10;
use dubp::block::DubpBlockV10Stringified;
use dubp::common::crypto::hashs::Hash;
use dubp::common::prelude::*;
use dubp::documents::{
    prelude::*, smallvec::SmallVec, transaction::TransactionDocumentTrait,
    transaction::TransactionDocumentV10,
};
use dubp::documents_parser::prelude::*;
use dubp::wallet::prelude::*;
use duniter_dbs::gva_v1::{TxEvent, TxsByIssuerEvent, TxsByRecipientEvent};
use duniter_dbs::{
    kv_typed::prelude::*, GvaV1Db, GvaV1DbReadable, GvaV1DbWritable, HashKeyV2, PendingTxDbV2,
    PubKeyKeyV2, TxDbV2, TxsMpV2Db, TxsMpV2DbReadable, TxsMpV2DbWritable, WalletConditionsV2,
};
use resiter::flatten::Flatten;
use resiter::map::Map;

pub fn add_pending_tx<
    B: Backend,
    F: FnOnce(
        &TransactionDocumentV10,
        &TxColRw<B::Col, duniter_dbs::txs_mp_v2::TxEvent>,
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
    )
        .write(
            |(mut txs_by_recv_time, mut txs_by_issuer, mut txs_by_recipient, mut txs)| {
                control(&tx, &txs)?;
                // Insert on col `txs_by_recv_time`
                let mut hashs = txs_by_recv_time.get(&received_time)?.unwrap_or_default();
                hashs.0.insert(tx_hash);
                txs_by_recv_time.upsert(received_time, hashs);
                // Insert on col `txs_by_issuer`
                for pubkey in tx.issuers() {
                    let mut hashs = txs_by_issuer.get(&PubKeyKeyV2(pubkey))?.unwrap_or_default();
                    hashs.0.insert(tx.get_hash());
                    txs_by_issuer.upsert(PubKeyKeyV2(pubkey), hashs);
                }
                // Insert on col `txs_by_recipient`
                for pubkey in tx.recipients_keys() {
                    let mut hashs = txs_by_recipient
                        .get(&PubKeyKeyV2(pubkey))?
                        .unwrap_or_default();
                    hashs.0.insert(tx.get_hash());
                    txs_by_recipient.upsert(PubKeyKeyV2(pubkey), hashs);
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

    Ok(())
}

pub fn remove_pending_tx_by_hash<B: Backend>(txs_mp_db: &TxsMpV2Db<B>, hash: Hash) -> KvResult<()> {
    remove_one_pending_tx(&txs_mp_db, hash)?;
    Ok(())
}

pub fn revert_block<B: Backend>(
    gva_db: &GvaV1Db<B>,
    txs_mp_db: &TxsMpV2Db<B>,
    block: DubpBlockV10Stringified,
    gva: bool,
) -> KvResult<()> {
    for tx in &block.transactions {
        let tx_hash = if let Some(ref tx_hash) = tx.hash {
            Hash::from_hex(&tx_hash)
                .map_err(|e| KvError::DeserError(format!("Transaction with invalid hash: {}", e)))?
        } else {
            return Err(KvError::DeserError(
                "Try to revert a block that contains a transaction without hash !".to_owned(),
            ));
        };
        if gva {
            let tx = tx::revert_tx(gva_db, &tx_hash)?.ok_or_else(|| {
                KvError::DbCorrupted(format!("GVA: tx '{}' dont exist on txs history.", tx_hash,))
            })?;
            add_pending_tx(|_, _| Ok(()), txs_mp_db, Cow::Owned(tx))?;
        } else {
            add_pending_tx(
                |_, _| Ok(()),
                txs_mp_db,
                Cow::Owned(
                    TransactionDocumentV10::from_string_object(&tx).map_err(|e| {
                        KvError::DeserError(format!("Block with invalid tx: {}", e))
                    })?,
                ),
            )?;
        }
    }

    identities::revert_identities(gva_db, &block)?;

    Ok(())
}

pub fn apply_block<B: Backend>(
    gva_db: &GvaV1Db<B>,
    txs_mp_db: &TxsMpV2Db<B>,
    block: DubpBlockV10Stringified,
    gva: bool,
) -> KvResult<()> {
    let block_hash = if let Some(ref block_hash_str) = block.hash {
        Hash::from_hex(&block_hash_str)
            .map_err(|_| KvError::DeserError(format!("Hash '{}' is invalid", block_hash_str)))?
    } else {
        return Err(KvError::DeserError(format!(
            "Block #{} is without hash",
            block.number
        )));
    };
    let blockstamp = Blockstamp {
        number: BlockNumber(block.number as u32),
        hash: BlockHash(block_hash),
    };
    let txs = block
        .transactions
        .iter()
        .map(|tx_str| TransactionDocumentV10::from_string_object(tx_str))
        .collect::<Result<Vec<TransactionDocumentV10>, TextParseError>>()
        .map_err(|e| KvError::DeserError(format!("Invalid transaction in block: {}", e)))?;
    write_block_txs(
        &txs_mp_db,
        &gva_db,
        blockstamp,
        block.median_time as i64,
        gva,
        txs,
    )?;

    if gva {
        identities::update_identities(&gva_db, &block)?;
    }

    Ok(())
}

#[inline(always)]
pub fn apply_chunk_of_blocks<B: Backend>(
    gva_db: &GvaV1Db<B>,
    txs_mp_db: &TxsMpV2Db<B>,
    blocks: Vec<DubpBlockV10Stringified>,
    gva: bool,
) -> KvResult<()> {
    for block in blocks {
        if block.number > 300_000 {
            log::info!("apply_block(#{})", block.number);
        }
        apply_block(gva_db, txs_mp_db, block, gva)?;
    }
    Ok(())
}

fn write_block_txs<B: Backend>(
    txs_mp_db: &TxsMpV2Db<B>,
    gva_db: &GvaV1Db<B>,
    current_blockstamp: Blockstamp,
    current_time: i64,
    gva: bool,
    txs: Vec<TransactionDocumentV10>,
) -> KvResult<()> {
    for tx in txs {
        let tx_hash = tx.get_hash();
        // Remove tx from mempool
        remove_one_pending_tx(&txs_mp_db, tx_hash)?;
        // Write tx and update sources
        if gva {
            tx::write_gva_tx(current_blockstamp, current_time, &gva_db, tx_hash, tx)?;
        }
    }
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
            v.0
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
        // Remove tx hash in col `txs_by_issuer`
        for pubkey in tx.0.issuers() {
            let mut hashs_ = txs_mp_db
                .txs_by_issuer()
                .get(&PubKeyKeyV2(pubkey))?
                .unwrap_or_default();
            hashs_.0.remove(&tx_hash);
            txs_mp_db
                .txs_by_issuer_write()
                .upsert(PubKeyKeyV2(pubkey), hashs_)?
        }
        // Remove tx hash in col `txs_by_recipient`
        for pubkey in tx.0.recipients_keys() {
            let mut hashs_ = txs_mp_db
                .txs_by_recipient()
                .get(&PubKeyKeyV2(pubkey))?
                .unwrap_or_default();
            hashs_.0.remove(&tx_hash);
            txs_mp_db
                .txs_by_recipient_write()
                .upsert(PubKeyKeyV2(pubkey), hashs_)?
        }
        // Remove tx itself
        txs_mp_db.txs_write().remove(HashKeyV2(tx_hash))?;
        Ok(true)
    } else {
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dubp::documents::transaction::TransactionDocumentV10Stringified;

    #[test]
    #[ignore]
    fn tmp_apply_block_real() -> KvResult<()> {
        let gva_db = GvaV1Db::<Sled>::open(
            SledConf::default()
                .path("/home/elois/.config/duniter/s2/data/gva_v1_sled")
                .flush_every_ms(None),
        )?;
        let txs_mp_db = TxsMpV2Db::<Sled>::open(
            SledConf::default()
                .path("/home/elois/.config/duniter/s2/data/txs_mp_v2_sled")
                .flush_every_ms(None),
        )?;

        let txs: Vec<TransactionDocumentV10Stringified> = serde_json::from_str(r#"[
            {
              "version": 10,
              "currency": "g1",
              "comment": ". je me sens plus legere mm si....reste le bon toit a trouver dans un temps record ! Merci pour cet eclairage fort",
              "locktime": 0,
              "signatures": [
                "8t5vo+k5OvkyAd+L+J8g6MLpp/AP0qOQFcJvf+OPMEZaVnHH38YtCigo64unU9aCsb9zZc6UEc78ZrkQ/E2TCg=="
              ],
              "outputs": [
                "5000:0:SIG(5VYg9YHvLQuoky7EPyyk3cEfBUtB1GuAeJ6SiJ6c9wWe)",
                "55:0:SIG(Ceq5Y6W5kjFkPrvcx5oAgugLMTwcEXyWgfn3P85TSj7x)"
              ],
              "inputs": [
                "1011:0:D:Ceq5Y6W5kjFkPrvcx5oAgugLMTwcEXyWgfn3P85TSj7x:296658",
                "1011:0:D:Ceq5Y6W5kjFkPrvcx5oAgugLMTwcEXyWgfn3P85TSj7x:296936",
                "1011:0:D:Ceq5Y6W5kjFkPrvcx5oAgugLMTwcEXyWgfn3P85TSj7x:297211",
                "1011:0:D:Ceq5Y6W5kjFkPrvcx5oAgugLMTwcEXyWgfn3P85TSj7x:297489",
                "1011:0:D:Ceq5Y6W5kjFkPrvcx5oAgugLMTwcEXyWgfn3P85TSj7x:297786"
              ],
              "unlocks": [
                "0:SIG(0)",
                "1:SIG(0)",
                "2:SIG(0)",
                "3:SIG(0)",
                "4:SIG(0)"
              ],
              "blockstamp": "304284-000003F738B9A5FC8F5D04B4B9746FD899B3A49367099BB2796E7EF976DCDABB",
              "blockstampTime": 0,
              "issuers": [
                "Ceq5Y6W5kjFkPrvcx5oAgugLMTwcEXyWgfn3P85TSj7x"
              ],
              "block_number": 0,
              "time": 0
            },
            {
              "version": 10,
              "currency": "g1",
              "comment": "Pour les places de cine et l expedition ..Merci",
              "locktime": 0,
              "signatures": [
                "VhzwAwsCr30XnetveS74QD2kJMYCQ89VZvyUBJM9DP/kd5KBqkF1c1HcKpJdHrfu2oq3JbSEIhEf/aLgnEdSCw=="
              ],
              "outputs": [
                "6000:0:SIG(jUPLL2BgY2QpheWEY3R13edV2Y4tvQMCXjJVM8PGDvyd)",
                "10347:0:SIG(2CWxxkttvkGSUVZdaUZHiksNisDC3wJx32Y2NVAyeHez)"
              ],
              "inputs": [
                "347:0:T:4EA4D01422469ABA380F48A48254EB3F15606C12FE4CFF7E7D6EEB1FD9752DDB:1",
                "16000:0:T:9A4DA56EF5F9B50D612D806BAE0886EB3033B4F166D2E96498DE16B83F39B59D:0"
              ],
              "unlocks": [
                "0:SIG(0)",
                "1:SIG(0)"
              ],
              "blockstamp": "304284-000003F738B9A5FC8F5D04B4B9746FD899B3A49367099BB2796E7EF976DCDABB",
              "blockstampTime": 0,
              "issuers": [
                "2CWxxkttvkGSUVZdaUZHiksNisDC3wJx32Y2NVAyeHez"
              ],
              "block_number": 0,
              "time": 0
            },
            {
              "version": 10,
              "currency": "g1",
              "comment": "POur le sac a tarte merci",
              "locktime": 0,
              "signatures": [
                "721K4f+F9PgksoVDZgQTURJIO/DZUhQfAzXfBvYrFkgqHNNeBbcgGecFX63rPYjFvau+qg1Hmi0coL9z7r7EAQ=="
              ],
              "outputs": [
                "15000:0:SIG(KxyNK1k55PEA8eBjX1K4dLJr35gC2dwMwNFPHwvZFH4)",
                "17668:0:SIG(4VQvVLT1R6upLuRk85A5eWTowqJwvkSMGQQZ9Hc4bqLg)"
              ],
              "inputs": [
                "1011:0:D:4VQvVLT1R6upLuRk85A5eWTowqJwvkSMGQQZ9Hc4bqLg:303924",
                "1011:0:D:4VQvVLT1R6upLuRk85A5eWTowqJwvkSMGQQZ9Hc4bqLg:304212",
                "10458:0:T:55113E18AB61603AD0FC24CD11ACBC96F9583FD0A5877055F17315E9613BBF7D:1",
                "20188:0:T:937A0454C1A63B383FBB6D219B9312B0A36DFE19DA08076BD113F9D5D4FC903D:1"
              ],
              "unlocks": [
                "0:SIG(0)",
                "1:SIG(0)",
                "2:SIG(0)",
                "3:SIG(0)"
              ],
              "blockstamp": "304284-000003F738B9A5FC8F5D04B4B9746FD899B3A49367099BB2796E7EF976DCDABB",
              "blockstampTime": 0,
              "issuers": [
                "4VQvVLT1R6upLuRk85A5eWTowqJwvkSMGQQZ9Hc4bqLg"
              ],
              "block_number": 0,
              "time": 0
            }
          ]"#).expect("wrong tx");

        let block = DubpBlockV10Stringified {
            number: 304286,
            hash: Some(
                "000001339AECF3CAB78B2B61776FB3819B800AB43923F4F8BD0F5AE47B7DEAB9".to_owned(),
            ),
            median_time: 1583862823,
            transactions: txs,
            ..Default::default()
        };

        apply_block(&gva_db, &txs_mp_db, block, true)?;

        Ok(())
    }
}

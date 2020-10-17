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

mod gva_writer;
mod identities;
mod tx;
mod utxos;

pub use gva_writer::GvaWriter;

use crate::utxos::UtxoV10;
use dubp::block::DubpBlockV10Stringified;
use dubp::common::crypto::bases::BaseConversionError;
use dubp::common::crypto::hashs::Hash;
use dubp::common::crypto::keys::ed25519::PublicKey;
use dubp::common::prelude::*;
use dubp::documents::{
    prelude::*, smallvec::SmallVec, transaction::TransactionDocumentTrait,
    transaction::TransactionDocumentV10,
};
use dubp::documents_parser::prelude::*;
use dubp::wallet::prelude::*;
use duniter_dbs::{
    kv_typed::prelude::*,
    //BlockNumberArrayV2, BlockNumberKeyV2, SourceAmountValV2, UtxosOfScriptV1
    GvaV1Db,
    GvaV1DbReadable,
    GvaV1DbWritable,
    HashKeyV2,
    PendingTxDbV2,
    PubKeyKeyV2,
    TxDbV2,
    TxsMpV2Db,
    TxsMpV2DbReadable,
    TxsMpV2DbWritable,
    WalletConditionsV2,
};
use flume::{Receiver, Sender};
use resiter::flatten::Flatten;
use resiter::map::Map;

pub struct DbsWriter<B: Backend> {
    gva_db: GvaV1Db<B>,
    new_pending_txs: Vec<TransactionDocumentV10>,
    recv: flume::Receiver<DbsWriterMsg>,
    server_pubkey: PublicKey,
    txs_mp_db: TxsMpV2Db<B>,
    txs_mp_len: usize,
}

pub enum DbsWriterMsg {
    AddPendingTx {
        tx: TransactionDocumentV10,
        max_tx_mp_size_opt: Option<usize>,
        sender: Sender<KvResult<bool>>,
    },
    ApplyBlock {
        block: DubpBlockV10Stringified,
        sender: Sender<KvResult<()>>,
    },
    ApplyChunkOfBlocks {
        blocks: Vec<DubpBlockV10Stringified>,
        sender: Sender<KvResult<()>>,
    },
    GetNewPendingTxs(Sender<Vec<TransactionDocumentV10>>),
    GetTxsMpLen(Sender<usize>),
    RemoveAllPendingTxs(Sender<KvResult<()>>),
    RemovePendingTxByHash(Hash, Sender<KvResult<()>>),
    RevertBlock {
        block: DubpBlockV10Stringified,
        sender: Sender<KvResult<()>>,
    },
    TrimExpiredNonWrittenTxs {
        limit_time: i64,
        sender: Sender<KvResult<()>>,
    },
    Stop,
}

impl<B: Backend> DbsWriter<B> {
    pub fn new(
        gva_db: GvaV1Db<B>,
        server_pubkey: PublicKey,
        txs_mp_db: TxsMpV2Db<B>,
    ) -> (Self, flume::Sender<DbsWriterMsg>) {
        let (sender, recv) = flume::bounded(64);
        let txs_mp_len = txs_mp_db
            .txs()
            .count()
            .expect("fail to init rust server: fail to get txs_mp_len");
        (
            DbsWriter {
                gva_db,
                new_pending_txs: Vec::new(),
                recv,
                server_pubkey,
                txs_mp_db,
                txs_mp_len,
            },
            sender,
        )
    }
    pub fn main_loop(mut self) {
        while let Ok(msg) = self.recv.recv() {
            match msg {
                DbsWriterMsg::AddPendingTx {
                    tx,
                    max_tx_mp_size_opt,
                    sender,
                } => {
                    let accepted = if let Some(max_tx_mp_size) = max_tx_mp_size_opt {
                        self.txs_mp_len < max_tx_mp_size
                            || tx.issuers().contains(&self.server_pubkey)
                    } else {
                        true
                    };
                    if accepted {
                        let res = self.add_pending_tx(tx.clone());
                        if res.is_ok() {
                            self.new_pending_txs.push(tx);
                            self.txs_mp_len += 1;
                        }
                        let _ = sender.send(res.map(|()| true));
                    } else {
                        let _ = sender.send(Ok(false));
                    }
                }
                DbsWriterMsg::ApplyBlock { block, sender } => {
                    let _ = sender.send(self.apply_block(block));
                }
                DbsWriterMsg::ApplyChunkOfBlocks { blocks, sender } => {
                    let _ = sender.send(self.apply_chunk_of_blocks(blocks));
                }
                DbsWriterMsg::GetNewPendingTxs(sender) => {
                    let _ = sender.send(self.new_pending_txs.drain(..).collect());
                }
                DbsWriterMsg::GetTxsMpLen(sender) => {
                    let _ = sender.send(self.txs_mp_len);
                }
                DbsWriterMsg::RemoveAllPendingTxs(sender) => {
                    let res = self.remove_all_pending_txs();
                    if res.is_ok() {
                        self.txs_mp_len = 0;
                    }
                    let _ = sender.send(res);
                }
                DbsWriterMsg::RemovePendingTxByHash(hash, sender) => {
                    let _ = sender.send(self.remove_pending_tx_by_hash(hash));
                }
                DbsWriterMsg::RevertBlock { block, sender } => {
                    let _ = sender.send(self.revert_block(block));
                }
                DbsWriterMsg::TrimExpiredNonWrittenTxs { limit_time, sender } => {
                    let _ = sender.send(self.trim_expired_non_written_txs(limit_time));
                }
                DbsWriterMsg::Stop => break,
            }
        }
        self.gva_db.save().expect("fail to save GVA DB");
        self.txs_mp_db.save().expect("fail to save TxsMp DB");
    }

    fn add_pending_tx(&self, tx: TransactionDocumentV10) -> KvResult<()> {
        let tx_hash = tx.get_hash();
        let received_time = chrono::offset::Utc::now().timestamp();
        // Insert on col `txs_by_recv_time`
        let mut hashs = self
            .txs_mp_db
            .txs_by_recv_time()
            .get(&received_time)?
            .unwrap_or_default();
        hashs.0.insert(tx_hash);
        self.txs_mp_db
            .txs_by_recv_time_write()
            .upsert(received_time, hashs)?;

        // Insert on col `txs_by_issuer`
        for pubkey in tx.issuers() {
            let mut hashs = self
                .txs_mp_db
                .txs_by_issuer()
                .get(&PubKeyKeyV2(pubkey))?
                .unwrap_or_default();
            hashs.0.insert(tx.get_hash());
            self.txs_mp_db
                .txs_by_issuer_write()
                .upsert(PubKeyKeyV2(pubkey), hashs)?;
        }
        // Insert on col `txs_by_recipient`
        for pubkey in tx.recipients_keys() {
            let mut hashs = self
                .txs_mp_db
                .txs_by_recipient()
                .get(&PubKeyKeyV2(pubkey))?
                .unwrap_or_default();
            hashs.0.insert(tx.get_hash());
            self.txs_mp_db
                .txs_by_recipient_write()
                .upsert(PubKeyKeyV2(pubkey), hashs)?;
        }
        // Insert tx itself
        self.txs_mp_db
            .txs_write()
            .upsert(HashKeyV2(tx_hash), PendingTxDbV2(tx))
    }

    fn remove_all_pending_txs(&self) -> KvResult<()> {
        self.txs_mp_db.txs_write().clear()?;
        self.txs_mp_db.txs_by_issuer_write().clear()?;
        self.txs_mp_db.txs_by_recipient_write().clear()?;
        self.txs_mp_db.txs_by_recv_time_write().clear()?;
        Ok(())
    }

    fn remove_pending_tx_by_hash(&mut self, hash: Hash) -> KvResult<()> {
        if remove_one_pending_tx(&self.txs_mp_db, hash)? {
            self.txs_mp_len -= 1;
        }
        Ok(())
    }

    fn revert_block(&self, block: DubpBlockV10Stringified) -> KvResult<()> {
        let block_txs_hashs = block
            .transactions
            .iter()
            .map(|tx| {
                if let Some(ref tx_hash) = tx.hash {
                    Ok(Hash::from_hex(&tx_hash))
                } else {
                    Err(KvError::DeserError(
                        "Try to revert a block that contains a transaction without hash !"
                            .to_owned(),
                    ))
                }
            })
            .collect::<KvResult<Result<Vec<Hash>, BaseConversionError>>>()?
            .map_err(|e| KvError::DeserError(format!("Transaction with invalid hash: {}", e)))?;
        for tx_hash in block_txs_hashs {
            let tx = tx::revert_tx(&self.gva_db, &tx_hash)?.ok_or_else(|| {
                KvError::DbCorrupted(format!("GVA: tx '{}' dont exist on txs history.", tx_hash,))
            })?;
            self.add_pending_tx(tx)?;
        }

        identities::revert_identities(&self.gva_db, &block)?;

        Ok(())
    }

    fn apply_block(&self, block: DubpBlockV10Stringified) -> KvResult<()> {
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
        self.write_block_txs(blockstamp, block.median_time as i64, txs)?;

        identities::update_identities(&self.gva_db, &block)?;

        Ok(())
    }

    #[inline(always)]
    fn apply_chunk_of_blocks(&self, blocks: Vec<DubpBlockV10Stringified>) -> KvResult<()> {
        for block in blocks {
            if block.number > 300_000 {
                log::info!("apply_block(#{})", block.number);
            }
            self.apply_block(block)?;
        }
        Ok(())
    }

    fn write_block_txs(
        &self,
        current_blockstamp: Blockstamp,
        current_time: i64,
        txs: Vec<TransactionDocumentV10>,
    ) -> KvResult<()> {
        for tx in txs {
            let tx_hash = tx.get_hash();
            // Remove tx from mempool
            remove_one_pending_tx(&self.txs_mp_db, tx_hash)?;
            // Write tx and update sources
            tx::write_tx(current_blockstamp, current_time, &self.gva_db, tx_hash, tx)?;
        }
        Ok(())
    }

    fn trim_expired_non_written_txs(&mut self, limit_time: i64) -> KvResult<()> {
        // Get hashs of tx to remove and "times" to remove
        let mut times = Vec::new();
        let hashs = self
            .txs_mp_db
            .txs_by_recv_time()
            .iter(..limit_time)
            .map_ok(|(k, v)| {
                times.push(k);
                v.0
            })
            .flatten_ok()
            .collect::<KvResult<SmallVec<[Hash; 4]>>>()?;
        // For each tx to remove
        for hash in hashs {
            if remove_one_pending_tx(&self.txs_mp_db, hash)? {
                self.txs_mp_len -= 1;
            }
        }
        // Remove txs hashs in col `txs_by_recv_time`
        for time in times {
            self.txs_mp_db.txs_by_recv_time_write().remove(time)?;
        }

        Ok(())
    }
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
        let (writer, _) = DbsWriter::<Sled>::new(
            GvaV1Db::open(
                SledConf::default()
                    .path("/home/elois/.config/duniter/s2/data/gva_v1_sled")
                    .flush_every_ms(None),
            )?,
            PublicKey::default(),
            TxsMpV2Db::open(
                SledConf::default()
                    .path("/home/elois/.config/duniter/s2/data/txs_mp_v2_sled")
                    .flush_every_ms(None),
            )?,
        );

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

        writer.apply_block(block)?;

        Ok(())
    }
}

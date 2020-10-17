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

mod conf;

pub use duniter_dbs::smallvec;

pub use crate::conf::{BackendConf, DuniterServerConf};
pub use duniter_dbs::TxEvent;
pub use duniter_gva::GvaConf;

use dubp::block::DubpBlockV10Stringified;
use dubp::common::crypto::hashs::Hash;
use dubp::common::crypto::keys::ed25519::PublicKey;
use dubp::common::prelude::*;
use dubp::documents::{prelude::*, transaction::TransactionDocumentV10};
use duniter_dbs::{
    kv_typed::backend::sled::{Config, Sled},
    kv_typed::prelude::Arc,
    kv_typed::prelude::*,
    //BlockNumberArrayV2, BlockNumberKeyV2, SourceAmountValV2, UtxosOfScriptV1
    DbsRo,
    GvaV1Db,
    GvaV1DbReadable,
    GvaV1DbWritable,
    HashKeyV2,
    PendingTxDbV2,
    TxsMpV2Db,
    TxsMpV2DbReadable,
    TxsMpV2DbWritable,
};
use duniter_dbs_read_ops::txs_history::TxsHistory;
use duniter_dbs_writer::{DbsWriter, DbsWriterMsg};
use flume::Receiver;
use resiter::filter::Filter;
use std::{path::Path, thread::JoinHandle};

pub struct DuniterServer {
    conf: DuniterServerConf,
    dbs_ro: DbsRo,
    writer_sender: flume::Sender<DbsWriterMsg>,
    writer_thread: Option<JoinHandle<()>>,
}

pub type TxsMpSubscriber = flume::Receiver<Arc<Events<TxEvent>>>;

impl Drop for DuniterServer {
    fn drop(&mut self) {
        let _ = self.writer_sender.send(DbsWriterMsg::Stop);
        if let Some(writer_thread) = self.writer_thread.take() {
            let _ = writer_thread.join();
        }
    }
}

impl DuniterServer {
    pub fn start(
        conf: DuniterServerConf,
        home_path_opt: Option<&Path>,
        software_version: &'static str,
    ) -> (Self, TxsMpSubscriber) {
        if home_path_opt.is_some() {
            let (gva_db, txs_mp_db) = conf::open_dbs::<Sled>(home_path_opt);
            let gva_db_ro = gva_db.get_ro_handler();
            let txs_mp_db_ro = txs_mp_db.get_ro_handler();

            let (writer, writer_sender) = DbsWriter::new(gva_db, conf.server_pubkey, txs_mp_db);
            let writer_thread = std::thread::spawn(move || writer.main_loop());

            if let Some(mut gva_conf) = conf.gva.clone() {
                if let Some(remote_path) = std::env::var_os("DUNITER_GVA_REMOTE_PATH") {
                    gva_conf.remote_path(
                        remote_path
                            .into_string()
                            .expect("Invalid utf8 for Env var DUNITER_GVA_REMOTE_PATH"),
                    );
                }
                duniter_gva::GvaServer::start(
                    gva_conf,
                    DbsRo::File {
                        gva_db_ro: gva_db_ro.clone(),
                        txs_mp_db_ro: txs_mp_db_ro.clone(),
                    },
                    software_version,
                    duniter_dbs_writer::GvaWriter::new(
                        conf.txs_mempool_size,
                        writer_sender.clone(),
                    ),
                )
                .expect("Fail to start GVA server");
            }

            let (s, txs_mp_subscriber) = flume::unbounded();
            txs_mp_db_ro
                .txs()
                .subscribe(s)
                .expect("fail to subscribe to tx mempool");

            (
                DuniterServer {
                    conf,
                    dbs_ro: DbsRo::File {
                        gva_db_ro,
                        txs_mp_db_ro,
                    },
                    writer_sender,
                    writer_thread: Some(writer_thread),
                },
                txs_mp_subscriber,
            )
        } else {
            let (gva_db, txs_mp_db) = conf::open_dbs::<Mem>(home_path_opt);
            let (s, txs_mp_subscriber) = flume::unbounded();
            txs_mp_db
                .txs()
                .subscribe(s)
                .expect("fail to subscribe to tx mempool");
            let dbs_ro = DbsRo::Mem {
                gva_db_ro: gva_db.get_ro_handler(),
                txs_mp_db_ro: txs_mp_db.get_ro_handler(),
            };

            let (writer, writer_sender) = DbsWriter::new(gva_db, conf.server_pubkey, txs_mp_db);
            let writer_thread = std::thread::spawn(move || writer.main_loop());

            (
                DuniterServer {
                    conf,
                    dbs_ro,
                    writer_sender,
                    writer_thread: Some(writer_thread),
                },
                txs_mp_subscriber,
            )
        }
    }

    /*
     * READ FUNCTIONS FOR DUNITER JS ONLY
     */
    pub fn accept_new_tx(
        &self,
        tx: TransactionDocumentV10,
        server_pubkey: PublicKey,
    ) -> KvResult<bool> {
        if tx.issuers().contains(&server_pubkey) {
            Ok(true)
        } else {
            let (s, r) = flume::bounded(0);
            let _ = self.writer_sender.send(DbsWriterMsg::GetTxsMpLen(s));
            let tx_mp_len = r.recv().expect("dbs writer disconnected");
            Ok(tx_mp_len < self.conf.txs_mempool_size)
        }
    }
    pub fn get_mempool_txs_free_rooms(&self) -> usize {
        let (s, r) = flume::bounded(0);
        let _ = self.writer_sender.send(DbsWriterMsg::GetTxsMpLen(s));
        self.conf.txs_mempool_size - r.recv().expect("dbs writer disconnected")
    }
    pub fn get_new_pending_txs(&self) -> KvResult<Vec<TransactionDocumentV10>> {
        let (s, r) = flume::bounded(0);
        let _ = self.writer_sender.send(DbsWriterMsg::GetNewPendingTxs(s));
        let new_pending_txs = r.recv().expect("dbs writer disconnected");
        Ok(new_pending_txs)
    }
    pub fn get_pending_txs(
        &self,
        _blockchain_time: i64,
        min_version: usize,
    ) -> KvResult<Vec<PendingTxDbV2>> {
        match &self.dbs_ro {
            DbsRo::File { txs_mp_db_ro, .. } => txs_mp_db_ro
                .txs()
                .iter(..)
                .values()
                .filter_ok(|tx| tx.0.version() >= min_version)
                .collect(),
            DbsRo::Mem { txs_mp_db_ro, .. } => txs_mp_db_ro
                .txs()
                .iter(..)
                .values()
                .filter_ok(|tx| tx.0.version() >= min_version)
                .collect(),
        }
    }

    pub fn get_transactions_history(&self, pubkey: PublicKey) -> KvResult<TxsHistory> {
        match &self.dbs_ro {
            DbsRo::File {
                gva_db_ro,
                txs_mp_db_ro,
            } => duniter_dbs_read_ops::txs_history::get_transactions_history(
                gva_db_ro,
                txs_mp_db_ro,
                pubkey,
            ),
            DbsRo::Mem {
                gva_db_ro,
                txs_mp_db_ro,
            } => duniter_dbs_read_ops::txs_history::get_transactions_history(
                gva_db_ro,
                txs_mp_db_ro,
                pubkey,
            ),
        }
    }

    pub fn get_tx_by_hash(
        &self,
        hash: Hash,
    ) -> KvResult<Option<(TransactionDocumentV10, Option<BlockNumber>)>> {
        match &self.dbs_ro {
            DbsRo::File {
                gva_db_ro,
                txs_mp_db_ro,
            } => {
                if let Some(tx) = txs_mp_db_ro.txs().get(&HashKeyV2(hash))? {
                    Ok(Some((tx.0, None)))
                } else if let Some(tx_db) = gva_db_ro.txs().get(&HashKeyV2(hash))? {
                    Ok(Some((tx_db.tx, Some(tx_db.written_block.number))))
                } else {
                    Ok(None)
                }
            }
            DbsRo::Mem {
                gva_db_ro,
                txs_mp_db_ro,
            } => {
                if let Some(tx) = txs_mp_db_ro.txs().get(&HashKeyV2(hash))? {
                    Ok(Some((tx.0, None)))
                } else if let Some(tx_db) = gva_db_ro.txs().get(&HashKeyV2(hash))? {
                    Ok(Some((tx_db.tx, Some(tx_db.written_block.number))))
                } else {
                    Ok(None)
                }
            }
        }
    }

    /*
     * WRITE FUNCTION FOR GVA (AND DUNITER JS via WS2P and BMA)
     */
    // force : false for GVA and true for DUNITER JS
    pub fn add_pending_tx(
        &self,
        tx: TransactionDocumentV10,
        force: bool,
    ) -> Receiver<KvResult<bool>> {
        let max_tx_mp_size_opt = if force {
            None
        } else {
            Some(self.conf.txs_mempool_size)
        };
        let (sender, receiver) = flume::bounded(0);
        let _ = self.writer_sender.send(DbsWriterMsg::AddPendingTx {
            tx,
            max_tx_mp_size_opt,
            sender,
        });
        receiver
    }

    /*
     * WRITE FUNCTIONS FOR DUNITER JS ONLY
     */
    pub fn remove_all_pending_txs(&self) -> KvResult<()> {
        let (s, r) = flume::bounded(0);
        let _ = self
            .writer_sender
            .send(DbsWriterMsg::RemoveAllPendingTxs(s));
        r.recv().expect("dbs writer disconnected")
    }
    pub fn remove_pending_tx_by_hash(&self, hash: Hash) -> KvResult<()> {
        let (s, r) = flume::bounded(0);
        let _ = self
            .writer_sender
            .send(DbsWriterMsg::RemovePendingTxByHash(hash, s));
        r.recv().expect("dbs writer disconnected")
    }
    pub fn revert_block(&self, block: DubpBlockV10Stringified) -> KvResult<()> {
        let (sender, r) = flume::bounded(0);
        let _ = self
            .writer_sender
            .send(DbsWriterMsg::RevertBlock { block, sender });
        r.recv().expect("dbs writer disconnected")
    }
    pub fn apply_block(&self, block: DubpBlockV10Stringified) -> KvResult<()> {
        let (sender, r) = flume::bounded(0);
        let _ = self
            .writer_sender
            .send(DbsWriterMsg::ApplyBlock { block, sender });
        r.recv().expect("dbs writer disconnected")
    }
    pub fn apply_chunk_of_blocks(&self, blocks: Vec<DubpBlockV10Stringified>) -> KvResult<()> {
        let (sender, r) = flume::bounded(0);
        let _ = self
            .writer_sender
            .send(DbsWriterMsg::ApplyChunkOfBlocks { blocks, sender });
        r.recv()
            .expect("apply_chunk_of_blocks: dbs writer disconnected")
    }
    pub fn trim_expired_non_written_txs(&self, limit_time: i64) -> KvResult<()> {
        let (sender, r) = flume::bounded(0);
        let _ = self
            .writer_sender
            .send(DbsWriterMsg::TrimExpiredNonWrittenTxs { limit_time, sender });
        r.recv().expect("dbs writer disconnected")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dubp::documents::smallvec::smallvec;
    use dubp::documents::transaction::TransactionDocumentV10Builder;

    #[test]
    fn test_txs_history() {
        let (server, _) = DuniterServer::start(
            DuniterServerConf {
                gva: None,
                server_pubkey: PublicKey::default(),
                txs_mempool_size: 200,
            },
            None,
            "test",
        );

        let tx = TransactionDocumentV10Builder {
            currency: "duniter_unit_test_currency",
            blockstamp: Blockstamp::default(),
            locktime: 0,
            issuers: smallvec![PublicKey::default()],
            inputs: &[],
            unlocks: &[],
            outputs: smallvec![],
            comment: "test",
            hash: None,
        }
        .build_with_signature(smallvec![]);
        server
            .add_pending_tx(tx.clone(), true)
            .recv()
            .expect("server disconnected")
            .expect("fail to add pending tx");

        let txs_history = server
            .get_transactions_history(PublicKey::default())
            .expect("fail to get txs history");

        tx.get_hash();
        assert_eq!(txs_history.sending, vec![tx])
    }
}

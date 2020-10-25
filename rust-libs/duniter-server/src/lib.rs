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
use duniter_mempools::{TxMpError, TxsMempool};
use fast_threadpool::ThreadPoolConfig;

pub use crate::conf::{BackendConf, DuniterServerConf};
pub use duniter_gva::GvaConf;

use dubp::block::DubpBlockV10Stringified;
use dubp::common::crypto::hashs::Hash;
use dubp::common::crypto::keys::ed25519::PublicKey;
use dubp::common::prelude::*;
use dubp::documents::{prelude::*, transaction::TransactionDocumentV10};
use duniter_dbs::prelude::*;
use duniter_dbs::{
    kv_typed::backend::memory::{Mem, MemConf},
    kv_typed::backend::sled::Sled,
    kv_typed::prelude::*,
    GvaV1Db, GvaV1DbReadable, GvaV1DbWritable, HashKeyV2, PendingTxDbV2, TxsMpV2Db,
    TxsMpV2DbReadable, TxsMpV2DbWritable,
};
use duniter_dbs_read_ops::txs_history::TxsHistory;
use resiter::filter::Filter;
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

pub struct DuniterServer {
    conf: DuniterServerConf,
    dbs_pool: fast_threadpool::ThreadPoolSyncHandler<DuniterDbs>,
    pending_txs_subscriber: flume::Receiver<Arc<Events<duniter_dbs::txs_mp_v2::TxEvent>>>,
    txs_mempool: TxsMempool,
}

impl DuniterServer {
    pub fn start(
        conf: DuniterServerConf,
        home_path_opt: Option<&Path>,
        software_version: &'static str,
    ) -> Self {
        let txs_mempool = TxsMempool::new(conf.txs_mempool_size);

        let dbs = conf::open_dbs(home_path_opt);

        let (s, pending_txs_subscriber) = flume::unbounded();
        dbs.txs_mp_db
            .txs()
            .subscribe(s)
            .expect("Fail to subscribe to txs col");

        let threadpool = if home_path_opt.is_some() {
            let threadpool =
                fast_threadpool::ThreadPool::start(ThreadPoolConfig::default(), dbs.clone());

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
                    dbs,
                    threadpool.async_handler(),
                    conf.server_pubkey,
                    software_version,
                    txs_mempool,
                )
                .expect("Fail to start GVA server");
            }
            threadpool
        } else {
            fast_threadpool::ThreadPool::start(ThreadPoolConfig::low(), dbs)
        };

        DuniterServer {
            conf,
            dbs_pool: threadpool.into_sync_handler(),
            pending_txs_subscriber,
            txs_mempool,
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
        let txs_mempool = self.txs_mempool;
        match self
            .dbs_pool
            .execute(move |dbs| {
                txs_mempool.accept_new_tx(&dbs.gva_db, server_pubkey, tx, &dbs.txs_mp_db)
            })
            .expect("dbs pool discorrected")
        {
            Ok(()) => Ok(true),
            Err(TxMpError::Db(e)) => Err(e),
            Err(_) => Ok(false),
        }
    }
    pub fn get_mempool_txs_free_rooms(&self) -> KvResult<usize> {
        let txs_mempool = self.txs_mempool;
        self.dbs_pool
            .execute(move |dbs| txs_mempool.get_free_rooms(&dbs.txs_mp_db))
            .expect("dbs pool discorrected")
    }
    pub fn get_new_pending_txs(&self) -> KvResult<Vec<TransactionDocumentV10>> {
        let mut new_pending_txs = BTreeMap::new();
        for events in self.pending_txs_subscriber.drain() {
            use std::ops::Deref as _;
            for event in events.deref() {
                match event {
                    duniter_dbs::txs_mp_v2::TxEvent::Upsert { key, value } => {
                        new_pending_txs.insert(key.0, value.0.clone());
                    }
                    duniter_dbs::txs_mp_v2::TxEvent::Remove { key } => {
                        new_pending_txs.remove(&key.0);
                    }
                    _ => (),
                }
            }
        }
        Ok(new_pending_txs.into_iter().map(|(_k, v)| v).collect())
    }
    pub fn get_pending_txs(
        &self,
        _blockchain_time: i64,
        min_version: usize,
    ) -> KvResult<Vec<PendingTxDbV2>> {
        self.dbs_pool
            .execute(move |dbs| {
                dbs.txs_mp_db.txs().iter(.., |it| {
                    it.values()
                        .filter_ok(|tx| tx.0.version() >= min_version)
                        .collect()
                })
            })
            .expect("dbs pool disconnected")
    }

    pub fn get_transactions_history(&self, pubkey: PublicKey) -> KvResult<TxsHistory> {
        self.dbs_pool
            .execute(move |dbs| {
                duniter_dbs_read_ops::txs_history::get_transactions_history(
                    &dbs.gva_db,
                    &dbs.txs_mp_db,
                    pubkey,
                )
            })
            .expect("dbs pool disconnected")
    }

    pub fn get_tx_by_hash(
        &self,
        hash: Hash,
    ) -> KvResult<Option<(TransactionDocumentV10, Option<BlockNumber>)>> {
        self.dbs_pool
            .execute(move |dbs| {
                if let Some(tx) = dbs.txs_mp_db.txs().get(&HashKeyV2(hash))? {
                    Ok(Some((tx.0, None)))
                } else if let Some(tx_db) = dbs.gva_db.txs().get(&HashKeyV2(hash))? {
                    Ok(Some((tx_db.tx, Some(tx_db.written_block.number))))
                } else {
                    Ok(None)
                }
            })
            .expect("dbs pool disconnected")
    }

    /*
     * WRITE FUNCTION FOR DUNITER JS ONLY
     */
    pub fn add_pending_tx_force(&self, tx: TransactionDocumentV10) -> KvResult<()> {
        let txs_mempool = self.txs_mempool;
        self.dbs_pool
            .execute(move |dbs| txs_mempool.add_pending_tx_force(&dbs.txs_mp_db, &tx))
            .expect("dbs pool disconnected")
    }

    pub fn remove_all_pending_txs(&self) -> KvResult<()> {
        self.dbs_pool
            .execute(move |dbs| duniter_dbs_write_ops::remove_all_pending_txs(&dbs.txs_mp_db))
            .expect("dbs pool disconnected")
    }
    pub fn remove_pending_tx_by_hash(&self, hash: Hash) -> KvResult<()> {
        self.dbs_pool
            .execute(move |dbs| {
                duniter_dbs_write_ops::remove_pending_tx_by_hash(&dbs.txs_mp_db, hash)
            })
            .expect("dbs pool disconnected")
    }
    pub fn revert_block(&self, block: DubpBlockV10Stringified) -> KvResult<()> {
        let gva = self.conf.gva.is_some();
        self.dbs_pool
            .execute(move |dbs| {
                duniter_dbs_write_ops::revert_block(&dbs.gva_db, &dbs.txs_mp_db, block, gva)
            })
            .expect("dbs pool disconnected")
    }
    pub fn apply_block(&self, block: DubpBlockV10Stringified) -> KvResult<()> {
        let gva = self.conf.gva.is_some();
        self.dbs_pool
            .execute(move |dbs| {
                duniter_dbs_write_ops::apply_block(&dbs.gva_db, &dbs.txs_mp_db, block, gva)
            })
            .expect("dbs pool disconnected")
    }
    pub fn apply_chunk_of_blocks(&self, blocks: Vec<DubpBlockV10Stringified>) -> KvResult<()> {
        let gva = self.conf.gva.is_some();
        self.dbs_pool
            .execute(move |dbs| {
                duniter_dbs_write_ops::apply_chunk_of_blocks(
                    &dbs.gva_db,
                    &dbs.txs_mp_db,
                    blocks,
                    gva,
                )
            })
            .expect("dbs pool disconnected")
    }
    pub fn trim_expired_non_written_txs(&self, limit_time: i64) -> KvResult<()> {
        self.dbs_pool
            .execute(move |dbs| {
                duniter_dbs_write_ops::trim_expired_non_written_txs(&dbs.txs_mp_db, limit_time)
            })
            .expect("dbs pool disconnected")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dubp::documents::smallvec::smallvec;
    use dubp::documents::transaction::TransactionDocumentV10Builder;

    #[test]
    fn test_txs_history() -> KvResult<()> {
        let server = DuniterServer::start(
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
        server.add_pending_tx_force(tx.clone())?;

        let txs_history = server.get_transactions_history(PublicKey::default())?;

        tx.get_hash();
        assert_eq!(txs_history.sending, vec![tx]);

        server.remove_all_pending_txs()?;

        assert_eq!(server.get_pending_txs(0, 0)?.len(), 0);

        Ok(())
    }
}

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

pub use duniter_dbs::smallvec;
use duniter_mempools::{TxMpError, TxsMempool};
use fast_threadpool::ThreadPoolConfig;

pub use duniter_gva::GvaConf;

use dubp::common::crypto::keys::ed25519::PublicKey;
use dubp::common::prelude::*;
use dubp::documents::{prelude::*, transaction::TransactionDocumentV10};
use dubp::{
    block::prelude::*, common::crypto::hashs::Hash, documents_parser::prelude::FromStringObject,
};
use duniter_dbs::{
    kv_typed::prelude::*, GvaV1DbReadable, HashKeyV2, PendingTxDbV2, TxsMpV2DbReadable,
};
use duniter_dbs::{prelude::*, BlockMetaV2};
use duniter_dbs_read_ops::txs_history::TxsHistory;
use resiter::filter::Filter;
use std::{collections::BTreeMap, path::Path};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DuniterCommand {
    Sync,
    Start,
}

#[derive(Clone, Debug)]
pub struct DuniterServerConf {
    pub gva: Option<GvaConf>,
    pub server_pubkey: PublicKey,
    pub txs_mempool_size: usize,
}

pub struct DuniterServer {
    conf: DuniterServerConf,
    current: Option<BlockMetaV2>,
    dbs_pool: fast_threadpool::ThreadPoolSyncHandler<DuniterDbs>,
    pending_txs_subscriber: flume::Receiver<Arc<Events<duniter_dbs::txs_mp_v2::TxEvent>>>,
    txs_mempool: TxsMempool,
}

impl DuniterServer {
    pub fn start(
        command_name: Option<String>,
        conf: DuniterServerConf,
        home_path_opt: Option<&Path>,
        software_version: &'static str,
    ) -> Self {
        let command = match command_name.unwrap_or_default().as_str() {
            "sync" => DuniterCommand::Sync,
            _ => DuniterCommand::Start,
        };

        let txs_mempool = TxsMempool::new(conf.txs_mempool_size);

        log::info!("open duniter databases...");
        let dbs = duniter_dbs::open_dbs(home_path_opt);
        log::info!("Databases successfully opened.");
        let current =
            duniter_dbs_read_ops::get_current_block_meta(&dbs.bc_db).expect("Fail to get current");

        let (s, pending_txs_subscriber) = flume::unbounded();
        dbs.txs_mp_db
            .txs()
            .subscribe(s)
            .expect("Fail to subscribe to txs col");

        let threadpool = if home_path_opt.is_some() {
            log::info!("start dbs threadpool...");
            let threadpool =
                fast_threadpool::ThreadPool::start(ThreadPoolConfig::default(), dbs.clone());

            if command != DuniterCommand::Sync {
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
            }
            threadpool
        } else {
            fast_threadpool::ThreadPool::start(ThreadPoolConfig::low(), dbs)
        };

        DuniterServer {
            conf,
            current,
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
            .execute(move |dbs| {
                duniter_dbs_write_ops::txs_mp::remove_all_pending_txs(&dbs.txs_mp_db)
            })
            .expect("dbs pool disconnected")
    }
    pub fn remove_pending_tx_by_hash(&self, hash: Hash) -> KvResult<()> {
        self.dbs_pool
            .execute(move |dbs| {
                duniter_dbs_write_ops::txs_mp::remove_pending_tx_by_hash(&dbs.txs_mp_db, hash)
            })
            .expect("dbs pool disconnected")
    }
    pub fn revert_block(&mut self, block: DubpBlockV10Stringified) -> KvResult<()> {
        let gva = self.conf.gva.is_some();
        let block = DubpBlockV10::from_string_object(&block)
            .map_err(|e| KvError::DeserError(format!("{}", e)))?;
        self.current = self
            .dbs_pool
            .execute(move |dbs| {
                duniter_dbs_write_ops::txs_mp::revert_block(block.transactions(), &dbs.txs_mp_db)?;
                if gva {
                    duniter_dbs_write_ops::gva::revert_block(&block, &dbs.gva_db)?;
                }
                duniter_dbs_write_ops::bc::revert_block(&dbs.bc_db, block)
            })
            .expect("dbs pool disconnected")?;
        Ok(())
    }
    pub fn apply_block(&mut self, block: DubpBlockV10Stringified) -> KvResult<()> {
        let gva = self.conf.gva.is_some();
        let block = DubpBlockV10::from_string_object(&block)
            .map_err(|e| KvError::DeserError(format!("{}", e)))?;
        self.current = Some(duniter_dbs_write_ops::apply_block::apply_block(
            block,
            self.current,
            &self.dbs_pool,
            gva,
            false,
        )?);
        Ok(())
    }
    pub fn apply_chunk_of_blocks(&mut self, blocks: Vec<DubpBlockV10Stringified>) -> KvResult<()> {
        log::debug!("apply_chunk(#{})", blocks[0].number);
        let gva = self.conf.gva.is_some();
        let blocks = blocks
            .into_iter()
            .map(|block| DubpBlockV10::from_string_object(&block))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| KvError::DeserError(format!("{}", e)))?;
        self.current = Some(duniter_dbs_write_ops::apply_block::apply_chunk(
            self.current,
            &self.dbs_pool,
            blocks,
            gva,
        )?);
        Ok(())
    }
    pub fn trim_expired_non_written_txs(&self, limit_time: i64) -> KvResult<()> {
        self.dbs_pool
            .execute(move |dbs| {
                duniter_dbs_write_ops::txs_mp::trim_expired_non_written_txs(
                    &dbs.txs_mp_db,
                    limit_time,
                )
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
            None,
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

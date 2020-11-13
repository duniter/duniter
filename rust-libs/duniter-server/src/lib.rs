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

pub use duniter_conf::DuniterConf;
pub use duniter_dbs::smallvec;
pub use duniter_gva::{GvaConf, GvaModule, PeerCardStringified};

use anyhow::Context;
use dubp::common::crypto::keys::ed25519::PublicKey;
use dubp::common::prelude::*;
use dubp::documents::{prelude::*, transaction::TransactionDocumentV10};
use dubp::{
    block::prelude::*, common::crypto::hashs::Hash, documents_parser::prelude::FromStringObject,
};
use duniter_dbs::cm_v1::{CmV1DbReadable, CmV1DbWritable};
use duniter_dbs::{
    kv_typed::prelude::*, GvaV1DbReadable, HashKeyV2, PendingTxDbV2, TxsMpV2DbReadable,
};
use duniter_dbs::{prelude::*, BlockMetaV2};
use duniter_dbs_read_ops::txs_history::TxsHistory;
use duniter_mempools::{Mempools, TxMpError, TxsMempool};
use duniter_module::{plug_duniter_modules, DuniterModule as _, Endpoint};
use fast_threadpool::ThreadPoolConfig;
use resiter::filter::Filter;
use std::{collections::BTreeMap, path::Path};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DuniterCommand {
    Sync,
    Start,
}

pub struct DuniterServer {
    conf: DuniterConf,
    current: Option<BlockMetaV2>,
    dbs_pool: fast_threadpool::ThreadPoolSyncHandler<DuniterDbs>,
    pending_txs_subscriber: flume::Receiver<Arc<Events<duniter_dbs::txs_mp_v2::TxsEvent>>>,
    txs_mempool: TxsMempool,
}

plug_duniter_modules!([GvaModule]);

impl DuniterServer {
    pub fn start(
        command_name: Option<String>,
        conf: DuniterConf,
        currency: String,
        home_path_opt: Option<&Path>,
        software_version: &'static str,
    ) -> anyhow::Result<Self> {
        let command = match command_name.unwrap_or_default().as_str() {
            "sync" => DuniterCommand::Sync,
            _ => DuniterCommand::Start,
        };

        let txs_mempool = TxsMempool::new(conf.txs_mempool_size);

        log::info!("open duniter databases...");
        let dbs = duniter_dbs::open_dbs(home_path_opt);
        log::info!("Databases successfully opened.");
        let current = duniter_dbs_read_ops::get_current_block_meta(&dbs.bc_db)
            .context("Fail to get current")?;
        if let Some(current) = current {
            log::info!("Current block: #{}-{}", current.number, current.hash);
        } else {
            log::info!("Current block: no blockchain");
        }

        let (s, pending_txs_subscriber) = flume::unbounded();
        dbs.txs_mp_db
            .txs()
            .subscribe(s)
            .context("Fail to subscribe to txs col")?;

        let threadpool = if home_path_opt.is_some() {
            log::info!("start dbs threadpool...");
            let threadpool = fast_threadpool::ThreadPool::start(ThreadPoolConfig::default(), dbs);

            if command != DuniterCommand::Sync && conf.gva.is_some() {
                let mut runtime = tokio::runtime::Builder::new()
                    .threaded_scheduler()
                    .enable_all()
                    .build()?;
                let conf_clone = conf.clone();
                let threadpool_async_handler = threadpool.async_handler();
                std::thread::spawn(move || {
                    runtime
                        .block_on(start_duniter_modules(
                            &conf_clone,
                            currency,
                            threadpool_async_handler,
                            Mempools { txs: txs_mempool },
                            None,
                            software_version,
                        ))
                        .context("Fail to start duniter modules")
                });
            }
            threadpool
        } else {
            fast_threadpool::ThreadPool::start(ThreadPoolConfig::low(), dbs)
        };

        Ok(DuniterServer {
            conf,
            current,
            dbs_pool: threadpool.into_sync_handler(),
            pending_txs_subscriber,
            txs_mempool,
        })
    }

    /*
     * READ FUNCTIONS FOR DUNITER JS ONLY
     */
    pub fn get_self_endpoints(&self) -> anyhow::Result<Vec<Endpoint>> {
        if let Some(self_peer) = self
            .dbs_pool
            .execute(|dbs| dbs.cm_db.self_peer_old().get(&()))?
            .context("fail to get self endpoints")?
        {
            Ok(self_peer.endpoints)
        } else {
            Ok(vec![])
        }
    }
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
                    duniter_dbs::txs_mp_v2::TxsEvent::Upsert { key, value } => {
                        new_pending_txs.insert(key.0, value.0.clone());
                    }
                    duniter_dbs::txs_mp_v2::TxsEvent::Remove { key } => {
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
    pub fn update_self_peer(&self, new_peer_card: PeerCardStringified) {
        self.dbs_pool
            .execute(move |dbs| {
                dbs.cm_db
                    .self_peer_old_write()
                    .upsert(
                        (),
                        duniter_dbs::PeerCardDbV1 {
                            version: new_peer_card.version,
                            currency: new_peer_card.currency,
                            pubkey: new_peer_card.pubkey,
                            blockstamp: new_peer_card.blockstamp,
                            endpoints: new_peer_card.endpoints,
                            status: new_peer_card.status,
                            signature: new_peer_card.signature,
                        },
                    )
                    .expect("fail to write on memory db")
            })
            .expect("dbs pool disconnected")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dubp::documents::transaction::TransactionDocumentV10Builder;
    use dubp::{crypto::keys::ed25519::Ed25519KeyPair, documents::smallvec::smallvec};

    #[test]
    fn test_txs_history() -> anyhow::Result<()> {
        let server = DuniterServer::start(
            None,
            DuniterConf {
                gva: None,
                self_key_pair: Ed25519KeyPair::generate_random()
                    .expect("fail to gen random keypair"),
                txs_mempool_size: 200,
            },
            "currency_test".to_owned(),
            None,
            "test",
        )?;

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

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
pub use duniter_dbs::{kv_typed::prelude::KvResult, smallvec, DunpHeadDbV1, DunpNodeIdV1Db};
pub use duniter_gva::{GvaConf, GvaModule, PeerCardStringified};

use anyhow::Context;
use dubp::common::crypto::keys::ed25519::PublicKey;
use dubp::common::prelude::*;
use dubp::documents::{prelude::*, transaction::TransactionDocumentV10};
use dubp::{
    block::prelude::*, common::crypto::hashs::Hash, documents_parser::prelude::FromStringObject,
};
use duniter_dbs::{
    databases::{
        bc_v2::BcV2Db,
        cm_v1::{CmV1DbReadable, CmV1DbWritable},
        gva_v1::GvaV1DbReadable,
        txs_mp_v2::TxsMpV2DbReadable,
    },
    kv_typed::prelude::*,
    HashKeyV2, PendingTxDbV2, PubKeyKeyV2,
};
use duniter_dbs::{prelude::*, BlockMetaV2, FileBackend};
use duniter_gva_dbs_reader::txs_history::TxsHistory;
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
    bc_db: BcV2Db<FileBackend>,
    conf: DuniterConf,
    current: Option<BlockMetaV2>,
    dbs_pool: fast_threadpool::ThreadPoolSyncHandler<DuniterDbs<FileBackend>>,
    pending_txs_subscriber:
        flume::Receiver<Arc<Events<duniter_dbs::databases::txs_mp_v2::TxsEvent>>>,
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
        let (bc_db, dbs) = duniter_dbs::open_dbs(home_path_opt);
        log::info!("Databases successfully opened.");
        let current = duniter_dbs_read_ops::get_current_block_meta(&dbs.bc_db_ro)
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
            bc_db,
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
                txs_mempool.accept_new_tx(&dbs.bc_db_ro, server_pubkey, tx, &dbs.txs_mp_db)
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
                    duniter_dbs::databases::txs_mp_v2::TxsEvent::Upsert { key, value } => {
                        new_pending_txs.insert(key.0, value.0.clone());
                    }
                    duniter_dbs::databases::txs_mp_v2::TxsEvent::Remove { key } => {
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
                duniter_gva_dbs_reader::txs_history::get_transactions_history_for_bma(
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
    pub fn apply_block(&mut self, block: DubpBlockV10Stringified) -> KvResult<()> {
        let block = Arc::new(
            DubpBlockV10::from_string_object(&block)
                .map_err(|e| KvError::DeserError(format!("{}", e)))?,
        );
        self.current = Some(duniter_dbs_write_ops::apply_block::apply_block(
            &self.bc_db,
            block.clone(),
            self.current,
            &self.dbs_pool,
            false,
        )?);
        apply_block_modules(block, &self.conf, &self.dbs_pool, None)
    }
    pub fn apply_chunk_of_blocks(&mut self, blocks: Vec<DubpBlockV10Stringified>) -> KvResult<()> {
        log::debug!("apply_chunk(#{})", blocks[0].number);
        let blocks = Arc::from(
            blocks
                .into_iter()
                .map(|block| DubpBlockV10::from_string_object(&block))
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| KvError::DeserError(format!("{}", e)))?,
        );
        self.current = Some(duniter_dbs_write_ops::apply_block::apply_chunk(
            &self.bc_db,
            self.current,
            &self.dbs_pool,
            blocks.clone(),
        )?);
        apply_chunk_of_blocks_modules(blocks, &self.conf, &self.dbs_pool, None)
    }
    pub fn receive_new_heads(
        &self,
        heads: Vec<(duniter_dbs::DunpNodeIdV1Db, duniter_dbs::DunpHeadDbV1)>,
    ) -> KvResult<()> {
        self.dbs_pool
            .execute(move |dbs| {
                for (dunp_node_id, dunp_head) in heads {
                    dbs.cm_db
                        .dunp_heads_old_write()
                        .upsert(dunp_node_id, dunp_head)?
                }
                Ok::<(), KvError>(())
            })
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
        let block = Arc::new(
            DubpBlockV10::from_string_object(&block)
                .map_err(|e| KvError::DeserError(format!("{}", e)))?,
        );
        let block_arc_clone = Arc::clone(&block);
        let txs_mp_job_handle = self
            .dbs_pool
            .launch(move |dbs| {
                duniter_dbs_write_ops::txs_mp::revert_block(
                    block_arc_clone.transactions(),
                    &dbs.txs_mp_db,
                )
            })
            .expect("dbs pool disconnected");
        self.current = duniter_dbs_write_ops::bc::revert_block(&self.bc_db, &block)?;
        txs_mp_job_handle.join().expect("dbs pool disconnected")?;
        revert_block_modules(block, &self.conf, &self.dbs_pool, None)
    }
    pub fn remove_all_peers(&self) -> KvResult<()> {
        use duniter_dbs::databases::dunp_v1::DunpV1DbWritable as _;
        self.dbs_pool
            .execute(move |dbs| dbs.dunp_db.peers_old_write().clear())
            .expect("dbs pool disconnected")
    }
    pub fn remove_peer_by_pubkey(&self, pubkey: PublicKey) -> KvResult<()> {
        use duniter_dbs::databases::dunp_v1::DunpV1DbWritable as _;
        self.dbs_pool
            .execute(move |dbs| dbs.dunp_db.peers_old_write().remove(PubKeyKeyV2(pubkey)))
            .expect("dbs pool disconnected")
    }
    pub fn save_peer(&self, new_peer_card: PeerCardStringified) -> anyhow::Result<()> {
        use dubp::crypto::keys::PublicKey as _;
        let pubkey = PublicKey::from_base58(&new_peer_card.pubkey)?;
        use duniter_dbs::databases::dunp_v1::DunpV1DbWritable as _;
        self.dbs_pool
            .execute(move |dbs| {
                dbs.dunp_db.peers_old_write().upsert(
                    PubKeyKeyV2(pubkey),
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
            })
            .expect("dbs pool disconnected")
            .map_err(|e| e.into())
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

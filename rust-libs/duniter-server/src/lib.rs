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

mod fill_cm;
mod legacy;

pub use duniter_core::conf::{DuniterCoreConf, DuniterMode};
use duniter_core::dbs::databases::{bc_v2::BcV2DbReadable, network_v1::NetworkV1DbWritable};
pub use duniter_core::dbs::{
    kv_typed::prelude::KvResult, smallvec, DunpHeadDbV1, DunpNodeIdV1Db, PeerCardDbV1,
};
#[cfg(feature = "gva")]
pub use duniter_gva::GvaModule;

use anyhow::Context;
use dubp::common::prelude::*;
use dubp::common::{crypto::keys::ed25519::PublicKey, currency_params::CurrencyParameters};
use dubp::documents::{prelude::*, transaction::TransactionDocumentV10};
use dubp::{
    block::prelude::*, common::crypto::hashs::Hash, documents_parser::prelude::FromStringObject,
};
use duniter_core::dbs::{
    databases::{bc_v2::BcV2Db, txs_mp_v2::TxsMpV2DbReadable},
    kv_typed::prelude::*,
    PendingTxDbV2, PubKeyKeyV2,
};
use duniter_core::dbs::{prelude::*, BlockMetaV2, FileBackend};
use duniter_core::global::{tokio, GlobalBackGroundTaskMsg};
use duniter_core::mempools::{Mempools, TxMpError, TxsMempool};
use duniter_core::module::{plug_duniter_modules, Endpoint, TxsHistoryForBma};
use fast_threadpool::ThreadPoolConfig;
use resiter::{filter::Filter, map::Map};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

// Plug duniter modules
use duniter_core::conf as duniter_conf;
use duniter_core::global as duniter_global;
use duniter_core::mempools as duniter_mempools;
cfg_if::cfg_if! {
    if #[cfg(feature = "gva")] {
        use duniter_core::module::DuniterModule;
        plug_duniter_modules!([GvaModule], TxsHistoryForBma);
    } else {
        plug_duniter_modules!([], TxsHistoryForBma);
    }
}

pub struct DuniterServer {
    bc_db: BcV2Db<FileBackend>,
    conf: DuniterCoreConf,
    currency_params: CurrencyParameters,
    current: Option<BlockMetaV2>,
    dbs_pool: fast_threadpool::ThreadPoolSyncHandler<SharedDbs<FileBackend>>,
    global_sender: flume::Sender<GlobalBackGroundTaskMsg>,
    pending_txs_subscriber:
        flume::Receiver<Arc<Events<duniter_core::dbs::databases::txs_mp_v2::TxsEvent>>>,
    profile_path_opt: Option<PathBuf>,
    shared_dbs: SharedDbs<FileBackend>,
    txs_mempool: TxsMempool,
}

impl DuniterServer {
    pub fn get_shared_dbs(&self) -> SharedDbs<FileBackend> {
        self.shared_dbs.clone()
    }
    pub fn start(
        conf: DuniterCoreConf,
        currency: String,
        duniter_mode: DuniterMode,
        profile_path_opt: Option<&Path>,
        software_version: &'static str,
    ) -> anyhow::Result<DuniterServer> {
        log::info!("mode={:?}", duniter_mode);

        let txs_mempool = TxsMempool::new(conf.txs_mempool_size);

        log::info!("open duniter databases...");
        let (bc_db, shared_dbs) = duniter_core::dbs::open_dbs(profile_path_opt)?;
        shared_dbs.dunp_db.heads_old_write().clear()?; // Clear WS2Pv1 HEADs

        // Create channel with global async task
        let (global_sender, global_recv) = flume::unbounded();

        // Fill and get current meta
        let current = fill_cm::fill_and_get_current_meta(&bc_db, &global_sender)?;
        log::info!("Databases successfully opened.");

        // Get currency parameters
        let currency_params = bc_db.currency_params().get(&())?.unwrap_or_default().0;

        if let Some(current) = current {
            log::info!("Current block: #{}-{}", current.number, current.hash);
        } else {
            log::info!("Current block: no blockchain");
        }

        let (s, pending_txs_subscriber) = flume::unbounded();
        shared_dbs
            .txs_mp_db
            .txs()
            .subscribe(s)
            .context("Fail to subscribe to txs col")?;

        log::info!("start dbs threadpool...");

        let threadpool =
            fast_threadpool::ThreadPool::start(ThreadPoolConfig::default(), shared_dbs.clone());

        // Start async runtime
        let conf_clone = conf.clone();
        let profile_path_opt_clone = profile_path_opt.map(ToOwned::to_owned);
        let threadpool_async_handler = threadpool.async_handler();
        std::thread::spawn(move || {
            duniter_core::global::get_async_runtime().block_on(async {
                // Start global background task
                duniter_core::global::start_global_background_task(global_recv).await;

                // Start duniter modules
                log::info!("start duniter modules...");
                start_duniter_modules(
                    &conf_clone,
                    currency,
                    threadpool_async_handler,
                    Mempools { txs: txs_mempool },
                    duniter_mode,
                    profile_path_opt_clone,
                    software_version,
                )
                .await
                .expect("Fail to start duniter modules");
            });
        });

        log::info!("Duniter sever started.");

        Ok(DuniterServer {
            bc_db,
            conf,
            current,
            currency_params,
            dbs_pool: threadpool.into_sync_handler(),
            global_sender,
            pending_txs_subscriber,
            profile_path_opt: profile_path_opt.map(ToOwned::to_owned),
            shared_dbs,
            txs_mempool,
        })
    }
    #[cfg(test)]
    pub(crate) fn test(
        conf: DuniterCoreConf,
        duniter_mode: DuniterMode,
    ) -> anyhow::Result<DuniterServer> {
        DuniterServer::start(
            conf,
            "test".to_owned(),
            duniter_mode,
            None,
            duniter_core::module::SOFTWARE_NAME,
        )
    }
}

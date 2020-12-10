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

mod legacy;

pub use duniter_conf::{gva_conf::GvaConf, DuniterConf};
pub use duniter_dbs::{
    kv_typed::prelude::KvResult, smallvec, DunpHeadDbV1, DunpNodeIdV1Db, PeerCardDbV1,
};
#[cfg(feature = "gva")]
pub use duniter_gva::GvaModule;

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
        txs_mp_v2::TxsMpV2DbReadable,
    },
    kv_typed::prelude::*,
    PendingTxDbV2, PubKeyKeyV2,
};
use duniter_dbs::{prelude::*, BlockMetaV2, FileBackend};
use duniter_mempools::{Mempools, TxMpError, TxsMempool};
use duniter_module::{plug_duniter_modules, Endpoint, TxsHistoryForBma};
use fast_threadpool::ThreadPoolConfig;
use resiter::filter::Filter;
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

cfg_if::cfg_if! {
    if #[cfg(feature = "gva")] {
        use duniter_module::DuniterModule as _;
        plug_duniter_modules!([GvaModule], TxsHistoryForBma);
    } else {
        plug_duniter_modules!([], TxsHistoryForBma);
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DuniterCommand {
    Sync,
    Start,
}

pub struct DuniterServer {
    bc_db: BcV2Db<FileBackend>,
    conf: DuniterConf,
    current: Option<BlockMetaV2>,
    dbs_pool: fast_threadpool::ThreadPoolSyncHandler<SharedDbs<FileBackend>>,
    pending_txs_subscriber:
        flume::Receiver<Arc<Events<duniter_dbs::databases::txs_mp_v2::TxsEvent>>>,
    profile_path_opt: Option<PathBuf>,
    txs_mempool: TxsMempool,
}

#[cfg(not(test))]
type DuniterServerInstance = DuniterServer;
#[cfg(test)]
type DuniterServerInstance = (DuniterServer, SharedDbs<FileBackend>);

impl DuniterServer {
    #[cfg(test)]
    pub(crate) fn test(conf: DuniterConf) -> anyhow::Result<DuniterServerInstance> {
        DuniterServer::start(
            None,
            conf,
            "test".to_owned(),
            None,
            duniter_module::SOFTWARE_NAME,
        )
    }
    pub fn start(
        command_name: Option<String>,
        conf: DuniterConf,
        currency: String,
        profile_path_opt: Option<&Path>,
        software_version: &'static str,
    ) -> anyhow::Result<DuniterServerInstance> {
        let command = match command_name.unwrap_or_default().as_str() {
            "sync" => DuniterCommand::Sync,
            _ => DuniterCommand::Start,
        };

        let txs_mempool = TxsMempool::new(conf.txs_mempool_size);

        log::info!("open duniter databases...");
        let (bc_db, dbs) = duniter_dbs::open_dbs(profile_path_opt);
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

        log::info!("start dbs threadpool...");

        #[cfg(test)]
        let threadpool =
            fast_threadpool::ThreadPool::start(ThreadPoolConfig::default(), dbs.clone());
        #[cfg(not(test))]
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

        let duniter_server = DuniterServer {
            bc_db,
            conf,
            current,
            dbs_pool: threadpool.into_sync_handler(),
            pending_txs_subscriber,
            profile_path_opt: profile_path_opt.map(ToOwned::to_owned),
            txs_mempool,
        };
        cfg_if::cfg_if! {
            if #[cfg(test)] {
                Ok((duniter_server, dbs))
            } else {
                Ok(duniter_server)
            }
        }
    }
}

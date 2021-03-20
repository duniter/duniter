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

mod anti_spam;
mod warp_;

pub use duniter_conf::gva_conf::GvaConf;

use async_graphql::http::GraphQLPlaygroundConfig;
use dubp::common::prelude::*;
use dubp::documents::transaction::TransactionDocumentV10;
use dubp::{block::DubpBlockV10, crypto::hashs::Hash};
use dubp::{
    common::crypto::keys::{ed25519::PublicKey, KeyPair as _},
    crypto::keys::ed25519::Ed25519KeyPair,
};
use duniter_conf::DuniterMode;
use duniter_dbs::databases::txs_mp_v2::TxsMpV2DbReadable;
use duniter_dbs::prelude::*;
use duniter_dbs::{kv_typed::prelude::*, FileBackend};
use duniter_gva_db::*;
use duniter_gva_gql::{GvaSchema, QueryContext};
use duniter_gva_indexer::{get_gva_db_ro, get_gva_db_rw};
use duniter_mempools::Mempools;
use futures::{StreamExt, TryStreamExt};
use std::{convert::Infallible, path::Path};
use warp::{http::Response as HttpResponse, Filter as _, Rejection};

#[derive(Debug)]
pub struct GvaModule {
    conf: Option<GvaConf>,
    currency: String,
    dbs_pool: fast_threadpool::ThreadPoolAsyncHandler<SharedDbs<FileBackend>>,
    gva_db_ro: &'static GvaV1DbRo<FileBackend>,
    mempools: Mempools,
    mode: DuniterMode,
    self_keypair: Ed25519KeyPair,
    software_version: &'static str,
}

#[async_trait::async_trait]
impl duniter_module::DuniterModule for GvaModule {
    const INDEX_BLOCKS: bool = true;

    fn apply_block(
        block: &DubpBlockV10,
        _conf: &duniter_conf::DuniterConf,
        profile_path_opt: Option<&Path>,
    ) -> KvResult<()> {
        let gva_db = get_gva_db_rw(profile_path_opt);
        duniter_gva_indexer::apply_block(&block, gva_db)
    }
    fn revert_block(
        block: &DubpBlockV10,
        _conf: &duniter_conf::DuniterConf,
        profile_path_opt: Option<&Path>,
    ) -> KvResult<()> {
        let gva_db = get_gva_db_rw(profile_path_opt);
        duniter_gva_indexer::revert_block(&block, gva_db)
    }
    fn init(
        conf: &duniter_conf::DuniterConf,
        currency: &str,
        dbs_pool: &fast_threadpool::ThreadPoolAsyncHandler<SharedDbs<FileBackend>>,
        mempools: Mempools,
        mode: duniter_conf::DuniterMode,
        profile_path_opt: Option<&Path>,
        software_version: &'static str,
    ) -> anyhow::Result<(Self, Vec<duniter_module::Endpoint>)> {
        let mut endpoints = Vec::new();
        if let Some(conf) = conf.gva.clone() {
            let remote_port = conf.get_remote_port();
            endpoints.push(format!(
                "GVA {}{} {} {}",
                if remote_port == 443 || conf.get_remote_tls() {
                    "S "
                } else {
                    ""
                },
                conf.get_remote_host(),
                remote_port,
                conf.get_remote_path(),
            ));
            endpoints.push(format!(
                "GVASUB {}{} {} {}",
                if remote_port == 443 || conf.get_remote_tls() {
                    "S "
                } else {
                    ""
                },
                conf.get_remote_host(),
                remote_port,
                conf.get_remote_subscriptions_path(),
            ));
        };
        Ok((
            GvaModule {
                conf: conf.gva.to_owned(),
                currency: currency.to_owned(),
                dbs_pool: dbs_pool.to_owned(),
                gva_db_ro: get_gva_db_ro(profile_path_opt),
                mempools,
                mode,
                self_keypair: conf.self_key_pair.clone(),
                software_version,
            },
            endpoints,
        ))
    }

    async fn start(self) -> anyhow::Result<()> {
        // Do not start GVA server on js tests
        if std::env::var_os("DUNITER_JS_TESTS") != Some("yes".into()) {
            let GvaModule {
                conf,
                currency,
                dbs_pool,
                gva_db_ro,
                mempools,
                mode,
                self_keypair,
                software_version,
            } = self;

            if let DuniterMode::Start = mode {
                if let Some(conf) = conf {
                    GvaModule::start_inner(
                        conf,
                        currency,
                        dbs_pool,
                        gva_db_ro,
                        mempools,
                        self_keypair,
                        software_version,
                    )
                    .await
                }
            }
        }
        Ok(())
    }
    // Needed for BMA only, will be removed when the migration is complete.
    fn get_transactions_history_for_bma(
        dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<SharedDbs<FileBackend>>,
        profile_path_opt: Option<&Path>,
        pubkey: PublicKey,
    ) -> KvResult<Option<duniter_module::TxsHistoryForBma>> {
        let gva_db = get_gva_db_ro(profile_path_opt);
        let duniter_gva_dbs_reader::txs_history::TxsHistory {
            sent,
            received,
            sending,
            pending,
        } = dbs_pool
            .execute(move |dbs| {
                duniter_gva_dbs_reader::txs_history::get_transactions_history_for_bma(
                    gva_db,
                    &dbs.txs_mp_db,
                    pubkey,
                )
            })
            .expect("dbs pool disconnected")?;
        Ok(Some(duniter_module::TxsHistoryForBma {
            sent: sent
                .into_iter()
                .map(
                    |GvaTxDbV1 {
                         tx,
                         written_block,
                         written_time,
                     }| (tx, written_block, written_time),
                )
                .collect(),
            received: received
                .into_iter()
                .map(
                    |GvaTxDbV1 {
                         tx,
                         written_block,
                         written_time,
                     }| (tx, written_block, written_time),
                )
                .collect(),
            sending,
            pending,
        }))
    }
    // Needed for BMA only, will be removed when the migration is complete.
    fn get_tx_by_hash(
        dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<SharedDbs<FileBackend>>,
        hash: Hash,
        profile_path_opt: Option<&Path>,
    ) -> KvResult<Option<(TransactionDocumentV10, Option<BlockNumber>)>> {
        let gva_db = get_gva_db_ro(profile_path_opt);
        dbs_pool
            .execute(move |dbs| {
                if let Some(tx) = dbs.txs_mp_db.txs().get(&duniter_dbs::HashKeyV2(hash))? {
                    Ok(Some((tx.0, None)))
                } else if let Some(tx_db) = gva_db.txs().get(&duniter_dbs::HashKeyV2(hash))? {
                    Ok(Some((tx_db.tx, Some(tx_db.written_block.number))))
                } else {
                    Ok(None)
                }
            })
            .expect("dbs pool disconnected")
    }
}

impl GvaModule {
    async fn start_inner(
        conf: GvaConf,
        currency: String,
        dbs_pool: fast_threadpool::ThreadPoolAsyncHandler<SharedDbs<FileBackend>>,
        gva_db_ro: &'static GvaV1DbRo<FileBackend>,
        mempools: Mempools,
        self_keypair: Ed25519KeyPair,
        software_version: &'static str,
    ) {
        log::info!("GvaServer::start: conf={:?}", conf);
        let self_pubkey = self_keypair.public_key();
        duniter_bca::set_bca_executor(
            currency.clone(),
            dbs_pool.clone(),
            duniter_gva_dbs_reader::create_dbs_reader(gva_db_ro),
            self_keypair,
            software_version,
            mempools.txs,
        );
        let gva_schema = duniter_gva_gql::build_schema_with_data(
            duniter_gva_gql::GvaSchemaData {
                dbs_reader: duniter_gva_dbs_reader::create_dbs_reader(gva_db_ro),
                dbs_pool,
                server_meta_data: duniter_gva_gql::ServerMetaData {
                    currency,
                    self_pubkey,
                    software_version,
                },
                txs_mempool: mempools.txs,
            },
            true,
        );

        let graphql_post = warp_::graphql(
            &conf,
            gva_schema.clone(),
            async_graphql::http::MultipartOptions::default(),
        );

        let conf_clone = conf.clone();
        let graphql_playground =
            warp::path::path(conf.get_path())
                .and(warp::get())
                .map(move || {
                    HttpResponse::builder()
                        .header("content-type", "text/html")
                        .body(async_graphql::http::playground_source(
                            GraphQLPlaygroundConfig::new(&format!("/{}", &conf_clone.get_path()))
                                .subscription_endpoint(&format!(
                                    "/{}",
                                    &conf_clone.get_subscriptions_path(),
                                )),
                        ))
                });

        let routes = graphql_playground
            .or(graphql_post)
            .or(warp_::graphql_ws(&conf, gva_schema.clone()))
            .recover(|err: Rejection| async move {
                if let Some(warp_::BadRequest(err)) = err.find() {
                    return Ok::<_, Infallible>(warp::reply::with_status(
                        err.to_string(),
                        http::StatusCode::BAD_REQUEST,
                    ));
                }

                Ok(warp::reply::with_status(
                    "INTERNAL_SERVER_ERROR".to_string(),
                    http::StatusCode::INTERNAL_SERVER_ERROR,
                ))
            });

        log::info!(
            "GVA server listen on http://{}:{}/{}",
            conf.get_ip4(),
            conf.get_port(),
            &conf.get_path()
        );
        if let Some(ip6) = conf.get_ip6() {
            log::info!(
                "GVA server listen on http://{}:{}/{}",
                ip6,
                conf.get_port(),
                &conf.get_path()
            );
            futures::future::join(
                warp::serve(routes.clone()).run((conf.get_ip4(), conf.get_port())),
                warp::serve(routes).run((ip6, conf.get_port())),
            )
            .await;
        } else {
            warp::serve(routes)
                .run((conf.get_ip4(), conf.get_port()))
                .await;
        }
        log::warn!("GVA server stopped");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use duniter_conf::DuniterConf;
    use duniter_mempools::Mempools;
    use duniter_module::DuniterModule;
    use fast_threadpool::{ThreadPool, ThreadPoolConfig};
    use unwrap::unwrap;

    #[tokio::test]
    #[ignore]
    async fn launch_mem_gva() -> anyhow::Result<()> {
        let dbs = unwrap!(SharedDbs::mem());
        let threadpool = ThreadPool::start(ThreadPoolConfig::default(), dbs);

        GvaModule::init(
            &DuniterConf::default(),
            "",
            &threadpool.into_async_handler(),
            Mempools::default(),
            duniter_conf::DuniterMode::Start,
            None,
            "test",
        )?
        .0
        .start()
        .await?;

        Ok(())
    }
}

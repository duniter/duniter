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

pub use duniter_conf::gva_conf::GvaConf;

mod anti_spam;
mod entities;
mod inputs;
mod inputs_validators;
mod mutations;
mod pagination;
mod queries;
mod schema;
mod subscriptions;
mod warp_;

use crate::entities::{
    block_gva::Block,
    tx_gva::TxGva,
    ud_gva::{CurrentUdGva, RevalUdGva, UdGva},
    AggregateSum, AmountWithBase, PeerCardGva, RawTxOrChanges, Sum, TxsHistoryBlockchain,
    TxsHistoryMempool, UtxoGva,
};
use crate::inputs::{TxIssuer, TxRecipient, UdsFilter};
use crate::inputs_validators::TxCommentValidator;
use crate::pagination::Pagination;
use crate::schema::{GraphQlSchema, SchemaData};
#[cfg(test)]
use crate::tests::create_dbs_reader;
#[cfg(test)]
use crate::tests::DbsReader;
use async_graphql::http::GraphQLPlaygroundConfig;
use async_graphql::validators::{IntGreaterThan, ListMinLength, StringMaxLength, StringMinLength};
use dubp::common::crypto::keys::{ed25519::PublicKey, KeyPair as _, PublicKey as _};
use dubp::common::prelude::*;
use dubp::documents::prelude::*;
use dubp::documents::transaction::{TransactionDocumentTrait, TransactionDocumentV10};
use dubp::documents_parser::prelude::*;
use dubp::wallet::prelude::*;
use dubp::{block::DubpBlockV10, crypto::hashs::Hash};
use duniter_dbs::databases::{
    gva_v1::{GvaV1DbReadable, GvaV1DbRo},
    txs_mp_v2::TxsMpV2DbReadable,
};
use duniter_dbs::prelude::*;
use duniter_dbs::{kv_typed::prelude::*, FileBackend, TxDbV2};
use duniter_gva_db_writer::{get_gva_db_ro, get_gva_db_rw};
#[cfg(not(test))]
use duniter_gva_dbs_reader::create_dbs_reader;
#[cfg(not(test))]
use duniter_gva_dbs_reader::DbsReader;
use duniter_mempools::{Mempools, TxsMempool};
use fast_threadpool::{JoinHandle, ThreadPoolDisconnected};
use futures::{StreamExt, TryStreamExt};
use resiter::map::Map;
use std::{
    convert::{Infallible, TryFrom},
    ops::Deref,
    path::Path,
};
use warp::{http::Response as HttpResponse, Filter as _, Rejection, Stream};

#[derive(Debug)]
pub struct GvaModule {
    conf: Option<GvaConf>,
    currency: String,
    dbs_pool: fast_threadpool::ThreadPoolAsyncHandler<SharedDbs<FileBackend>>,
    gva_db_ro: &'static GvaV1DbRo<FileBackend>,
    mempools: Mempools,
    self_pubkey: PublicKey,
    software_version: &'static str,
}

#[async_trait::async_trait]
impl duniter_module::DuniterModule for GvaModule {
    fn apply_block(
        block: Arc<DubpBlockV10>,
        conf: &duniter_conf::DuniterConf,
        dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<SharedDbs<FileBackend>>,
        profile_path_opt: Option<&Path>,
    ) -> Result<Option<JoinHandle<KvResult<()>>>, ThreadPoolDisconnected> {
        let gva_db = get_gva_db_rw(profile_path_opt);
        if conf.gva.is_some() {
            Ok(Some(dbs_pool.launch(move |_| {
                duniter_gva_db_writer::apply_block(&block, gva_db)
            })?))
        } else {
            Ok(None)
        }
    }
    fn apply_chunk_of_blocks(
        blocks: Arc<[DubpBlockV10]>,
        conf: &duniter_conf::DuniterConf,
        dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<SharedDbs<FileBackend>>,
        profile_path_opt: Option<&Path>,
    ) -> Result<Option<JoinHandle<KvResult<()>>>, ThreadPoolDisconnected> {
        let gva_db = get_gva_db_rw(profile_path_opt);
        if conf.gva.is_some() {
            Ok(Some(dbs_pool.launch(move |_| {
                for block in blocks.deref() {
                    duniter_gva_db_writer::apply_block(&block, gva_db)?;
                }
                Ok::<_, KvError>(())
            })?))
        } else {
            Ok(None)
        }
    }
    fn revert_block(
        block: Arc<DubpBlockV10>,
        conf: &duniter_conf::DuniterConf,
        dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<SharedDbs<FileBackend>>,
        profile_path_opt: Option<&Path>,
    ) -> Result<Option<JoinHandle<KvResult<()>>>, ThreadPoolDisconnected> {
        let gva_db = get_gva_db_rw(profile_path_opt);
        if conf.gva.is_some() {
            Ok(Some(dbs_pool.launch(move |_| {
                duniter_gva_db_writer::revert_block(&block, gva_db)
            })?))
        } else {
            Ok(None)
        }
    }
    fn init(
        conf: &duniter_conf::DuniterConf,
        currency: &str,
        dbs_pool: &fast_threadpool::ThreadPoolAsyncHandler<SharedDbs<FileBackend>>,
        mempools: Mempools,
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
                self_pubkey: conf.self_key_pair.public_key(),
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
                self_pubkey,
                software_version,
            } = self;

            if let Some(conf) = conf {
                GvaModule::start_inner(
                    conf,
                    currency,
                    dbs_pool,
                    gva_db_ro,
                    mempools,
                    self_pubkey,
                    software_version,
                )
                .await
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
                    |TxDbV2 {
                         tx,
                         written_block,
                         written_time,
                     }| (tx, written_block, written_time),
                )
                .collect(),
            received: received
                .into_iter()
                .map(
                    |TxDbV2 {
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
        self_pubkey: PublicKey,
        software_version: &'static str,
    ) {
        log::info!("GvaServer::start: conf={:?}", conf);
        let schema = async_graphql::Schema::build(
            queries::QueryRoot::default(),
            mutations::MutationRoot::default(),
            subscriptions::SubscriptionRoot::default(),
        )
        .data(schema::SchemaData {
            dbs_reader: create_dbs_reader(gva_db_ro),
            dbs_pool,
            server_meta_data: ServerMetaData {
                currency,
                self_pubkey,
                software_version,
            },
            txs_mempool: mempools.txs,
        })
        .extension(async_graphql::extensions::Logger)
        .finish();

        let graphql_post = warp_::graphql(
            &conf,
            schema.clone(),
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
            .or(warp_::graphql_ws(&conf, schema.clone()))
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

#[derive(Debug, Default)]
pub struct ServerMetaData {
    pub currency: String,
    pub self_pubkey: PublicKey,
    pub software_version: &'static str,
}

#[cfg(test)]
mod tests {
    use super::*;
    use dubp::documents::transaction::TransactionInputV10;
    use duniter_conf::DuniterConf;
    use duniter_dbs::databases::bc_v2::*;
    use duniter_dbs::SourceAmountValV2;
    use duniter_gva_dbs_reader::pagination::*;
    use duniter_mempools::Mempools;
    use duniter_module::DuniterModule;
    use fast_threadpool::ThreadPoolConfig;
    use unwrap::unwrap;

    mockall::mock! {
        pub DbsReader {
            fn all_uds_of_pubkey(
                &self,
                bc_db: &BcV2DbRo<FileBackend>,
                pubkey: PublicKey,
                page_info: PageInfo<BlockNumber>,
            ) -> KvResult<PagedData<duniter_gva_dbs_reader::uds_of_pubkey::UdsWithSum>>;
            fn get_current_frame<BcDb: 'static + BcV2DbReadable>(
                &self,
                bc_db: &BcDb,
            ) -> anyhow::Result<Vec<duniter_dbs::BlockMetaV2>>;
            fn find_inputs<BcDb: 'static + BcV2DbReadable, TxsMpDb: 'static + TxsMpV2DbReadable>(
                &self,
                bc_db: &BcDb,
                txs_mp_db: &TxsMpDb,
                amount: SourceAmount,
                script: &WalletScriptV10,
                use_mempool_sources: bool,
            ) -> anyhow::Result<(Vec<TransactionInputV10>, SourceAmount)>;
            fn find_script_utxos<TxsMpDb: 'static + TxsMpV2DbReadable>(
                &self,
                txs_mp_db_ro: &TxsMpDb,
                amount_target_opt: Option<SourceAmount>,
                page_info: PageInfo<duniter_gva_dbs_reader::utxos::UtxoCursor>,
                script: &WalletScriptV10,
            ) -> anyhow::Result<PagedData<duniter_gva_dbs_reader::utxos::UtxosWithSum>>;
            fn get_account_balance(
                &self,
                account_script: &WalletScriptV10,
            ) -> KvResult<Option<SourceAmountValV2>>;
            fn get_blockchain_time(
                &self,
                block_number: BlockNumber,
            ) -> anyhow::Result<u64>;
            fn get_current_ud<BcDb: 'static + BcV2DbReadable>(
                &self,
                bc_db: &BcDb,
            ) -> KvResult<Option<SourceAmount>>;
            fn get_txs_history_bc_received(
                &self,
                script_hash: Hash,
            ) -> KvResult<Vec<TxDbV2>>;
            fn get_txs_history_bc_sent(
                &self,
                script_hash: Hash,
            ) -> KvResult<Vec<TxDbV2>>;
            fn get_txs_history_mempool<TxsMpDb: 'static + TxsMpV2DbReadable>(
                &self,
                txs_mp_db_ro: &TxsMpDb,
                pubkey: PublicKey,
            ) -> KvResult<(Vec<TransactionDocumentV10>, Vec<TransactionDocumentV10>)>;
            fn unspent_uds_of_pubkey<BcDb: 'static + BcV2DbReadable>(
                &self,
                bc_db: &BcDb,
                pubkey: PublicKey,
                page_info: PageInfo<BlockNumber>,
                bn_to_exclude_opt: Option<&'static std::collections::BTreeSet<BlockNumber>>,
                amount_target_opt: Option<SourceAmount>,
            ) -> KvResult<PagedData<duniter_gva_dbs_reader::uds_of_pubkey::UdsWithSum>>;
        }
    }
    pub type DbsReader = duniter_dbs::kv_typed::prelude::Arc<MockDbsReader>;

    // This function is never call but needed to compile
    pub fn create_dbs_reader(_: &'static GvaV1DbRo<FileBackend>) -> DbsReader {
        unreachable!()
    }

    pub(crate) fn create_schema(dbs_ops: MockDbsReader) -> KvResult<GraphQlSchema> {
        let dbs = SharedDbs::mem()?;
        let threadpool = fast_threadpool::ThreadPool::start(ThreadPoolConfig::default(), dbs);
        Ok(async_graphql::Schema::build(
            queries::QueryRoot::default(),
            mutations::MutationRoot::default(),
            subscriptions::SubscriptionRoot::default(),
        )
        .data(schema::SchemaData {
            dbs_pool: threadpool.into_async_handler(),
            dbs_reader: Arc::new(dbs_ops),
            server_meta_data: ServerMetaData {
                currency: "test_currency".to_owned(),
                self_pubkey: PublicKey::default(),
                software_version: "test",
            },
            txs_mempool: TxsMempool::new(10),
        })
        .extension(async_graphql::extensions::Logger)
        .finish())
    }

    pub(crate) async fn exec_graphql_request(
        schema: &GraphQlSchema,
        request: &str,
    ) -> anyhow::Result<serde_json::Value> {
        Ok(serde_json::to_value(schema.execute(request).await)?)
    }

    #[tokio::test]
    #[ignore]
    async fn launch_mem_gva() -> anyhow::Result<()> {
        let dbs = unwrap!(SharedDbs::mem());
        let threadpool = fast_threadpool::ThreadPool::start(ThreadPoolConfig::default(), dbs);

        GvaModule::init(
            &DuniterConf::default(),
            "",
            &threadpool.into_async_handler(),
            Mempools::default(),
            None,
            "test",
        )?
        .0
        .start()
        .await?;

        Ok(())
    }
}

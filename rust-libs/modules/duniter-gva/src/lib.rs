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

mod entities;
mod mutations;
mod queries;
mod schema;
mod subscriptions;
mod warp_;

use crate::entities::{
    tx_gva::TxGva,
    ud_gva::{CurrentUdGva, RevalUdGva, UdGva},
    TxsHistoryGva, UtxoGva,
};
use crate::schema::{GraphQlSchema, SchemaData};
use async_graphql::http::GraphQLPlaygroundConfig;
use dubp::common::crypto::keys::{ed25519::PublicKey, KeyPair as _, PublicKey as _};
use dubp::common::prelude::*;
use dubp::documents::prelude::*;
use dubp::documents::transaction::{
    TransactionDocumentTrait, TransactionDocumentV10, TransactionDocumentV10Builder,
    TransactionInputUnlocksV10, TransactionInputV10, TransactionOutputV10, UTXOConditions,
};
use dubp::documents_parser::prelude::*;
use dubp::wallet::prelude::*;
use duniter_dbs::prelude::*;
use duniter_dbs::{kv_typed::prelude::*, TxDbV2, TxsMpV2DbReadable};
use duniter_mempools::{Mempools, TxsMempool};
use futures::{StreamExt, TryStreamExt};
use resiter::map::Map;
use smallvec::smallvec as svec;
use std::convert::Infallible;
use std::ops::Deref;
use warp::{http::Response as HttpResponse, Filter as _, Rejection, Stream};

#[derive(Debug)]
pub struct GvaModule {
    conf: Option<GvaConf>,
    currency: String,
    dbs_pool: fast_threadpool::ThreadPoolAsyncHandler<DuniterDbs>,
    mempools: Mempools,
    self_pubkey: PublicKey,
    software_version: &'static str,
}

#[async_trait::async_trait]
impl duniter_module::DuniterModule for GvaModule {
    fn init(
        conf: &duniter_conf::DuniterConf,
        currency: &str,
        dbs_pool: &fast_threadpool::ThreadPoolAsyncHandler<DuniterDbs>,
        mempools: Mempools,
        _profile_path_opt: Option<&std::path::Path>,
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
                mempools,
                self_pubkey: conf.self_key_pair.public_key(),
                software_version,
            },
            endpoints,
        ))
    }

    async fn start(self) -> anyhow::Result<()> {
        let GvaModule {
            conf,
            currency,
            dbs_pool,
            mempools,
            self_pubkey,
            software_version,
        } = self;

        if let Some(conf) = conf {
            GvaModule::start_inner(
                conf,
                currency,
                dbs_pool,
                mempools,
                self_pubkey,
                software_version,
            )
            .await
        }
        Ok(())
    }
}

impl GvaModule {
    async fn start_inner(
        conf: GvaConf,
        currency: String,
        dbs_pool: fast_threadpool::ThreadPoolAsyncHandler<DuniterDbs>,
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
            &conf.get_host(),
            conf.get_port(),
            &conf.get_path()
        );
        warp::serve(routes)
            .run(([0, 0, 0, 0], conf.get_port()))
            .await;
        log::warn!("GVA server stopped");
    }
}

#[derive(Debug, Default)]
pub struct ServerMetaData {
    pub currency: String,
    pub self_pubkey: PublicKey,
    pub software_version: &'static str,
}

#[derive(
    async_graphql::SimpleObject, Clone, Debug, Default, serde::Deserialize, serde::Serialize,
)]
#[serde(rename_all = "camelCase")]
#[graphql(name = "PeerCard")]
pub struct PeerCardStringified {
    pub version: u32,
    pub currency: String,
    pub pubkey: String,
    pub blockstamp: String,
    pub endpoints: Vec<String>,
    pub status: String,
    pub signature: String,
}
impl From<duniter_dbs::PeerCardDbV1> for PeerCardStringified {
    fn from(peer: duniter_dbs::PeerCardDbV1) -> Self {
        Self {
            version: peer.version,
            currency: peer.currency,
            pubkey: peer.pubkey,
            blockstamp: peer.blockstamp,
            endpoints: peer.endpoints,
            status: peer.status,
            signature: peer.signature,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use duniter_conf::DuniterConf;
    use duniter_mempools::Mempools;
    use duniter_module::DuniterModule;
    use fast_threadpool::ThreadPoolConfig;
    use unwrap::unwrap;

    #[tokio::test]
    #[ignore]
    async fn launch_mem_gva() -> anyhow::Result<()> {
        let dbs = unwrap!(DuniterDbs::mem());
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

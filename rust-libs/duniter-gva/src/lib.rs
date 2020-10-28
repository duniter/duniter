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
use dubp::common::crypto::keys::{ed25519::PublicKey, PublicKey as _};
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
use duniter_mempools::TxsMempool;
use futures::{StreamExt, TryStreamExt};
use resiter::map::Map;
use smallvec::smallvec as svec;
use std::convert::Infallible;
use std::ops::Deref;
use warp::{http::Response as HttpResponse, Filter as _, Rejection, Stream};

#[derive(Clone, Debug)]
pub struct GvaConf {
    host: String,
    port: u16,
    remote_path: String,
    subscriptions_path: String,
}

impl Default for GvaConf {
    fn default() -> Self {
        GvaConf {
            host: "localhost".to_owned(),
            port: 30901,
            remote_path: "gva".to_owned(),
            subscriptions_path: "gva-sub".to_owned(),
        }
    }
}

impl GvaConf {
    pub fn host(&mut self, host: String) {
        self.host = host;
    }
    pub fn port(&mut self, port: u16) {
        self.port = port;
    }
    pub fn remote_path(&mut self, mut remote_path: String) {
        if remote_path.starts_with('/') {
            remote_path.remove(0);
            self.remote_path = remote_path;
        } else {
            self.remote_path = remote_path;
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct GvaServer;

impl GvaServer {
    pub fn start(
        conf: GvaConf,
        currency: String,
        dbs: DuniterDbs,
        dbs_pool: fast_threadpool::ThreadPoolAsyncHandler<DuniterDbs>,
        server_pubkey: PublicKey,
        software_version: &'static str,
        txs_mempool: TxsMempool,
    ) -> Result<(), tokio::io::Error> {
        println!("TMP GvaServer::start: conf={:?}", conf);
        let mut runtime = tokio::runtime::Builder::new()
            .threaded_scheduler()
            .enable_all()
            .build()?;
        std::thread::spawn(move || {
            runtime.block_on(async {
                let schema = async_graphql::Schema::build(
                    queries::QueryRoot::default(),
                    mutations::MutationRoot::default(),
                    subscriptions::SubscriptionRoot::default(),
                )
                .data(schema::SchemaData {
                    currency,
                    dbs,
                    dbs_pool,
                    server_pubkey,
                    software_version,
                    txs_mempool,
                })
                .extension(async_graphql::extensions::Logger)
                .finish();

                let graphql_post = warp_::graphql(
                    &conf,
                    schema.clone(),
                    async_graphql::http::MultipartOptions::default(),
                );

                let conf_clone = conf.clone();
                let graphql_playground = warp::path::path(conf.remote_path.clone())
                    .and(warp::get())
                    .map(move || {
                        HttpResponse::builder()
                            .header("content-type", "text/html")
                            .body(async_graphql::http::playground_source(
                                GraphQLPlaygroundConfig::new(&format!(
                                    "/{}",
                                    &conf_clone.remote_path
                                ))
                                .subscription_endpoint(&format!(
                                    "/{}",
                                    &conf_clone.subscriptions_path,
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
                    "Start GVA server at http://localhost:{}/{}",
                    conf.port,
                    &conf.remote_path
                );
                warp::serve(routes).run(([0, 0, 0, 0], conf.port)).await;
            });
            log::warn!("GVA server stopped");
        });
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use duniter_dbs::bc_v2::{BcV2Db, BcV2DbWritable};
    use duniter_dbs::kv_typed::backend::memory::{Mem, MemConf};
    use duniter_dbs::{GvaV1Db, GvaV1DbWritable, TxsMpV2Db, TxsMpV2DbWritable};
    use fast_threadpool::ThreadPoolConfig;
    use unwrap::unwrap;

    #[test]
    #[ignore]
    fn launch_mem_gva() {
        let dbs = DuniterDbs {
            bc_db: unwrap!(BcV2Db::<Mem>::open(MemConf::default())),
            gva_db: unwrap!(GvaV1Db::<Mem>::open(MemConf::default())),
            txs_mp_db: unwrap!(TxsMpV2Db::<Mem>::open(MemConf::default())),
        };
        let threadpool =
            fast_threadpool::ThreadPool::start(ThreadPoolConfig::default(), dbs.clone());

        unwrap!(GvaServer::start(
            GvaConf::default(),
            "test".to_owned(),
            dbs,
            threadpool.into_async_handler(),
            PublicKey::default(),
            "test",
            TxsMempool::new(10)
        ));

        std::thread::sleep(std::time::Duration::from_secs(120));
    }
}

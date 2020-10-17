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
mod resolvers;
mod schema;
mod warp_;

use crate::entities::{TxGva, TxsHistoryGva, UtxoGva};
use crate::schema::SchemaData;
use async_graphql::http::GraphQLPlaygroundConfig;
use dubp::common::crypto::keys::{ed25519::PublicKey, PublicKey as _};
use dubp::documents::prelude::*;
use dubp::documents::transaction::{TransactionDocumentTrait, TransactionDocumentV10};
use dubp::documents_parser::prelude::*;
use duniter_dbs::{kv_typed::prelude::*, DbsRo, TxDbV2, TxsMpV2DbReadable};
use duniter_dbs_writer::GvaWriter;
use futures::{StreamExt, TryStreamExt};
use schema::GraphQlSchema;
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
        dbs_ro: DbsRo,
        software_version: &'static str,
        writer: GvaWriter,
    ) -> Result<(), tokio::io::Error> {
        println!("TMP GvaServer::start: conf={:?}", conf);
        let mut runtime = tokio::runtime::Builder::new()
            .threaded_scheduler()
            .enable_all()
            .build()?;
        std::thread::spawn(move || {
            runtime.block_on(async {
                let schema = async_graphql::Schema::build(
                    schema::Query::default(),
                    schema::Mutation::default(),
                    schema::Subscription::default(),
                )
                .data(schema::SchemaData {
                    dbs_ro,
                    software_version,
                    writer,
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
    use duniter_dbs::kv_typed::backend::memory::{Mem, MemConf};
    use duniter_dbs::{GvaV1Db, GvaV1DbWritable, TxsMpV2Db, TxsMpV2DbWritable};
    use unwrap::unwrap;

    #[test]
    #[ignore]
    fn launch_mem_gva() {
        let gva_db_ro = unwrap!(GvaV1Db::<Mem>::open(MemConf::default())).get_ro_handler();
        let txs_mp_db_ro = unwrap!(TxsMpV2Db::<Mem>::open(MemConf::default())).get_ro_handler();

        unwrap!(GvaServer::start(
            GvaConf::default(),
            DbsRo::Mem {
                gva_db_ro,
                txs_mp_db_ro,
            },
            "test",
            GvaWriter::mock()
        ));

        std::thread::sleep(std::time::Duration::from_secs(120));
    }
}

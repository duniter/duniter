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
mod inputs;
mod inputs_validators;
mod mutations;
mod pagination;
mod queries;
mod scalars;
mod schema;
mod subscriptions;

pub use schema::{build_schema_with_data, get_schema_definition, GvaSchema, GvaSchemaData};

use crate::entities::{
    block_gva::{Block, BlockMeta},
    idty_gva::Identity,
    tx_gva::TxGva,
    ud_gva::{CurrentUdGva, RevalUdGva, UdGva},
    utxos_gva::UtxosGva,
    AggregateSum, AmountWithBase, EdgeTx, PeerCardGva, RawTxOrChanges, Sum, TxDirection,
    TxsHistoryMempool, UtxoGva, UtxoTimedGva,
};
use crate::inputs::{TxIssuer, TxRecipient, UdsFilter};
use crate::inputs_validators::TxCommentValidator;
use crate::pagination::Pagination;
use crate::scalars::{PkOrScriptGva, PubKeyGva};
#[cfg(test)]
use crate::tests::AsyncAccessor;
#[cfg(test)]
use crate::tests::DbsReaderImpl;
use async_graphql::connection::{Connection, Edge, EmptyFields};
use async_graphql::validators::{IntGreaterThan, IntRange, ListMaxLength, ListMinLength};
use dubp::common::crypto::keys::{ed25519::PublicKey, PublicKey as _};
use dubp::common::prelude::*;
use dubp::crypto::hashs::Hash;
use dubp::documents::prelude::*;
use dubp::documents::transaction::{TransactionDocumentTrait, TransactionDocumentV10};
use dubp::documents_parser::prelude::*;
use dubp::wallet::prelude::*;
use duniter_dbs::databases::txs_mp_v2::TxsMpV2DbReadable;
use duniter_dbs::prelude::*;
use duniter_dbs::{kv_typed::prelude::*, FileBackend};
#[cfg(not(test))]
use duniter_global::AsyncAccessor;
use duniter_gva_dbs_reader::pagination::PageInfo;
use duniter_gva_dbs_reader::DbsReader;
#[cfg(not(test))]
use duniter_gva_dbs_reader::DbsReaderImpl;
use duniter_mempools::TxsMempool;
use futures::{Stream, StreamExt};
use resiter::map::Map;
use std::{borrow::Cow, convert::TryFrom, num::NonZeroUsize, ops::Deref};

#[derive(Clone, Copy, Debug, Default)]
pub struct QueryContext {
    pub is_whitelisted: bool,
}

#[derive(Debug, Default)]
pub struct ServerMetaData {
    pub currency: String,
    pub self_pubkey: PublicKey,
    pub software_version: &'static str,
}

#[cfg(test)]
mod tests {
    pub use duniter_global::{CurrentMeta, MockAsyncAccessor};
    pub use duniter_gva_dbs_reader::MockDbsReader;

    use super::*;
    use fast_threadpool::ThreadPoolConfig;

    pub type AsyncAccessor = duniter_dbs::kv_typed::prelude::Arc<MockAsyncAccessor>;
    pub type DbsReaderImpl = duniter_dbs::kv_typed::prelude::Arc<MockDbsReader>;

    pub(crate) fn create_schema(
        mock_cm: MockAsyncAccessor,
        dbs_ops: MockDbsReader,
    ) -> KvResult<GvaSchema> {
        let dbs = SharedDbs::mem()?;
        let threadpool = fast_threadpool::ThreadPool::start(ThreadPoolConfig::default(), dbs);
        Ok(schema::build_schema_with_data(
            schema::GvaSchemaData {
                cm_accessor: Arc::new(mock_cm),
                dbs_pool: threadpool.into_async_handler(),
                dbs_reader: Arc::new(dbs_ops),
                server_meta_data: ServerMetaData {
                    currency: "test_currency".to_owned(),
                    self_pubkey: PublicKey::default(),
                    software_version: "test",
                },
                txs_mempool: TxsMempool::new(10),
            },
            true,
        ))
    }

    pub(crate) async fn exec_graphql_request(
        schema: &GvaSchema,
        request: &str,
    ) -> anyhow::Result<serde_json::Value> {
        Ok(serde_json::to_value(
            schema
                .execute(async_graphql::Request::new(request).data(QueryContext::default()))
                .await,
        )?)
    }

    /*pub(crate) fn create_schema_sub(dbs: SharedDbs<FileBackend>) -> KvResult<GvaSchema> {
        let threadpool = fast_threadpool::ThreadPool::start(ThreadPoolConfig::default(), dbs);
        Ok(schema::build_schema_with_data(
            schema::GvaSchemaData {
                dbs_pool: threadpool.into_async_handler(),
                dbs_reader: Arc::new(MockDbsReader::new()),
                server_meta_data: ServerMetaData {
                    currency: "test_currency".to_owned(),
                    self_pubkey: PublicKey::default(),
                    software_version: "test",
                },
                txs_mempool: TxsMempool::new(10),
            },
            true,
        ))
    }

    pub(crate) fn exec_graphql_subscription(
        schema: &GvaSchema,
        request: String,
    ) -> impl Stream<Item = serde_json::Result<serde_json::Value>> + Send {
        schema.execute_stream(request).map(serde_json::to_value)
    }*/
}

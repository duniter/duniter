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
mod schema;
mod subscriptions;

pub use schema::{build_schema, build_schema_with_data, GvaSchema, GvaSchemaData};

use crate::entities::{
    block_gva::Block,
    tx_gva::TxGva,
    ud_gva::{CurrentUdGva, RevalUdGva, UdGva},
    AggregateSum, AmountWithBase, EdgeTx, PeerCardGva, RawTxOrChanges, Sum, TxDirection,
    TxsHistoryMempool, UtxoGva,
};
use crate::inputs::{TxIssuer, TxRecipient, UdsFilter};
use crate::inputs_validators::TxCommentValidator;
use crate::pagination::Pagination;
#[cfg(test)]
use crate::tests::DbsReader;
use async_graphql::connection::{Connection, Edge, EmptyFields};
use async_graphql::validators::{IntGreaterThan, ListMinLength, StringMaxLength, StringMinLength};
use dubp::common::crypto::keys::{ed25519::PublicKey, PublicKey as _};
use dubp::common::prelude::*;
use dubp::crypto::hashs::Hash;
use dubp::documents::prelude::*;
use dubp::documents::transaction::{TransactionDocumentTrait, TransactionDocumentV10};
use dubp::documents_parser::prelude::*;
use dubp::wallet::prelude::*;
use duniter_dbs::databases::txs_mp_v2::TxsMpV2DbReadable;
use duniter_dbs::prelude::*;
use duniter_dbs::{kv_typed::prelude::*, FileBackend, TxDbV2};
use duniter_gva_dbs_reader::pagination::PageInfo;
#[cfg(not(test))]
use duniter_gva_dbs_reader::DbsReader;
use duniter_mempools::TxsMempool;
use futures::{Stream, StreamExt};
use resiter::map::Map;
use std::{convert::TryFrom, ops::Deref};

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
    use duniter_dbs::databases::bc_v2::*;
    use duniter_dbs::SourceAmountValV2;
    use duniter_gva_dbs_reader::pagination::*;
    use fast_threadpool::ThreadPoolConfig;
    use std::collections::VecDeque;

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
                page_info: PageInfo<duniter_gva_dbs_reader::txs_history::TxBcCursor>,
                script_hash: Hash,
            ) -> KvResult<PagedData<VecDeque<TxDbV2>>>;
            fn get_txs_history_bc_sent(
                &self,
                page_info: PageInfo<duniter_gva_dbs_reader::txs_history::TxBcCursor>,
                script_hash: Hash,
            ) -> KvResult<PagedData<VecDeque<TxDbV2>>>;
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

    pub(crate) fn create_schema(dbs_ops: MockDbsReader) -> KvResult<GvaSchema> {
        let dbs = SharedDbs::mem()?;
        let threadpool = fast_threadpool::ThreadPool::start(ThreadPoolConfig::default(), dbs);
        Ok(schema::build_schema_with_data(
            schema::GvaSchemaData {
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
        Ok(serde_json::to_value(schema.execute(request).await)?)
    }

    pub(crate) fn create_schema_sub(dbs: SharedDbs<FileBackend>) -> KvResult<GvaSchema> {
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
    }
}

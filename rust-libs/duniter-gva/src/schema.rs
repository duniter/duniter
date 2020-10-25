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

use crate::*;

pub(crate) type GraphQlSchema = async_graphql::Schema<Query, Mutation, Subscription>;
pub(crate) struct SchemaData {
    pub(crate) dbs: DuniterDbs,
    pub(crate) dbs_pool: fast_threadpool::ThreadPoolAsyncHandler<DuniterDbs>,
    pub(crate) server_pubkey: PublicKey,
    pub(crate) software_version: &'static str,
    pub(crate) txs_mempool: TxsMempool,
}

#[derive(async_graphql::MergedObject, Default)]
pub struct Query(
    resolvers::NodeQuery,
    resolvers::txs_history::TxsHistoryQuery,
    resolvers::utxos::UtxosQuery,
);

#[derive(Clone, Copy, Default)]
pub struct Subscription;

#[async_graphql::Subscription]
impl Subscription {
    async fn receive_pending_txs(
        &self,
        ctx: &async_graphql::Context<'_>,
    ) -> impl Stream<Item = Vec<TxGva>> {
        let data = ctx.data::<SchemaData>().expect("fail to access db");

        let (s, r) = flume::unbounded();

        data.dbs
            .txs_mp_db
            .txs()
            .subscribe(s)
            .expect("fail to access db");

        r.into_stream().filter_map(|events| {
            let mut txs = Vec::new();
            for event in events.deref() {
                if let duniter_dbs::txs_mp_v2::TxEvent::Upsert {
                    value: ref pending_tx,
                    ..
                } = event
                {
                    txs.push(TxGva::from(&pending_tx.0));
                }
            }
            if txs.is_empty() {
                futures::future::ready(None)
            } else {
                futures::future::ready(Some(txs))
            }
        })
    }
}

#[derive(Clone, Copy, Default)]
pub struct Mutation;

#[async_graphql::Object]
impl Mutation {
    /// Process a transaction
    /// Return the transaction if it successfully inserted
    async fn tx(
        &self,
        ctx: &async_graphql::Context<'_>,
        raw_tx: String,
    ) -> async_graphql::Result<TxGva> {
        let tx = TransactionDocumentV10::parse_from_raw_text(&raw_tx)?;

        tx.verify(None)?;

        let data = ctx.data::<SchemaData>()?;

        let server_pubkey = data.server_pubkey;
        let txs_mempool = data.txs_mempool;

        let tx = data
            .dbs_pool
            .execute(move |dbs| {
                txs_mempool
                    .add_pending_tx(&dbs.gva_db, server_pubkey, &dbs.txs_mp_db, &tx)
                    .map(|()| tx)
            })
            .await??;

        Ok(TxGva::from(&tx))
    }

    /// Process several transactions
    /// Return an array of successfully inserted transactions
    async fn txs(
        &self,
        ctx: &async_graphql::Context<'_>,
        raw_txs: Vec<String>,
    ) -> async_graphql::Result<Vec<TxGva>> {
        let txs = raw_txs
            .iter()
            .map(|raw_tx| TransactionDocumentV10::parse_from_raw_text(&raw_tx))
            .collect::<Result<Vec<TransactionDocumentV10>, _>>()?;

        let data = ctx.data::<SchemaData>()?;

        let server_pubkey = data.server_pubkey;
        let txs_mempool = data.txs_mempool;

        let mut processed_txs = Vec::with_capacity(txs.len());
        for tx in txs {
            tx.verify(None)?;
            let tx = data
                .dbs_pool
                .execute(move |dbs| {
                    txs_mempool
                        .add_pending_tx(&dbs.gva_db, server_pubkey, &dbs.txs_mp_db, &tx)
                        .map(|()| tx)
                })
                .await??;
            processed_txs.push(TxGva::from(&tx));
        }

        Ok(processed_txs)
    }
}

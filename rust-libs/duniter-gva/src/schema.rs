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
    pub(crate) dbs_ro: DbsRo,
    pub(crate) software_version: &'static str,
    pub(crate) writer: GvaWriter,
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

        match &data.dbs_ro {
            DbsRo::File { txs_mp_db_ro, .. } => {
                txs_mp_db_ro.txs().subscribe(s).expect("fail to access db")
            }
            DbsRo::Mem { txs_mp_db_ro, .. } => {
                txs_mp_db_ro.txs().subscribe(s).expect("fail to access db")
            }
        }

        r.into_stream().filter_map(|events| {
            let mut txs = Vec::new();
            for event in events.deref() {
                if let duniter_dbs::TxEvent::Upsert {
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
    /// Return false if the mempool is full
    async fn tx(
        &self,
        ctx: &async_graphql::Context<'_>,
        raw_tx: String,
    ) -> async_graphql::Result<bool> {
        let tx = TransactionDocumentV10::parse_from_raw_text(&raw_tx)?;

        tx.verify(None)?;

        let data = ctx.data::<SchemaData>()?;

        let tx_already_exist = match &data.dbs_ro {
            DbsRo::File { gva_db_ro, .. } => {
                duniter_dbs_read_ops::txs_history::tx_exist(gva_db_ro, tx.get_hash())?
            }
            DbsRo::Mem { gva_db_ro, .. } => {
                duniter_dbs_read_ops::txs_history::tx_exist(gva_db_ro, tx.get_hash())?
            }
        };

        if tx_already_exist {
            Err(async_graphql::Error::new(
                "Transaction already written in blockchain",
            ))
        } else {
            Ok(data
                .writer
                .add_pending_tx(tx)
                .recv_async()
                .await
                .expect("dbs-writer disconnected")?)
        }
    }

    /// Process several transactions
    /// Return the numbers of transactions successfully inserted on mempool
    async fn txs(
        &self,
        ctx: &async_graphql::Context<'_>,
        raw_txs: Vec<String>,
    ) -> async_graphql::Result<u32> {
        let txs = raw_txs
            .iter()
            .map(|raw_tx| TransactionDocumentV10::parse_from_raw_text(&raw_tx))
            .collect::<Result<Vec<TransactionDocumentV10>, _>>()?;

        let data = ctx.data::<SchemaData>()?;

        for tx in &txs {
            tx.verify(None)?;
            if match &data.dbs_ro {
                DbsRo::File { gva_db_ro, .. } => {
                    duniter_dbs_read_ops::txs_history::tx_exist(gva_db_ro, tx.get_hash())?
                }
                DbsRo::Mem { gva_db_ro, .. } => {
                    duniter_dbs_read_ops::txs_history::tx_exist(gva_db_ro, tx.get_hash())?
                }
            } {
                return Err(async_graphql::Error::new(
                    "Transaction already written in blockchain",
                ));
            }
        }

        let mut count = 0;
        for tx in txs {
            if data
                .writer
                .add_pending_tx(tx)
                .recv_async()
                .await
                .expect("dbs-writer disconnected")?
            {
                count += 1;
            } else {
                return Ok(count);
            }
        }
        Ok(count)
    }
}

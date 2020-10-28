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

#[derive(Clone, Copy, Default)]
pub struct MutationRoot;

#[async_graphql::Object]
impl MutationRoot {
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

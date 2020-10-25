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

#[derive(Default)]
pub(crate) struct TxsHistoryQuery;
#[async_graphql::Object]
impl TxsHistoryQuery {
    /// Transactions history
    async fn transactions_history(
        &self,
        ctx: &async_graphql::Context<'_>,
        #[graphql(desc = "Ed25519 public key on base 58 representation")] pubkey: String,
    ) -> async_graphql::Result<TxsHistoryGva> {
        let pubkey = PublicKey::from_base58(&pubkey)?;

        let data = ctx.data::<SchemaData>()?;

        let txs_history = data
            .dbs_pool
            .execute(move |dbs| {
                duniter_dbs_read_ops::txs_history::get_transactions_history(
                    &dbs.gva_db,
                    &dbs.txs_mp_db,
                    pubkey,
                )
            })
            .await??;

        Ok(TxsHistoryGva {
            sent: txs_history
                .sent
                .into_iter()
                .map(|db_tx| db_tx.into())
                .collect(),
            received: txs_history
                .received
                .into_iter()
                .map(|db_tx| db_tx.into())
                .collect(),
        })
    }
}

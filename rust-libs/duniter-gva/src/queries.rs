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

pub mod gen_txs;
pub mod txs_history;
pub mod uds;
pub mod utxos;

use crate::*;

#[derive(async_graphql::MergedObject, Default)]
pub struct QueryRoot(
    queries::NodeQuery,
    queries::gen_txs::GenTxsQuery,
    queries::txs_history::TxsHistoryQuery,
    queries::uds::UdsQuery,
    queries::utxos::UtxosQuery,
);

#[derive(async_graphql::SimpleObject)]
struct Node {
    /// Software
    software: &'static str,

    /// Software version
    version: &'static str,
}

#[derive(Default)]
pub(crate) struct NodeQuery;

#[async_graphql::Object]
impl NodeQuery {
    /// Node informations
    async fn node(&self, ctx: &async_graphql::Context<'_>) -> async_graphql::Result<Node> {
        let data = ctx.data::<SchemaData>()?;
        Ok(Node {
            software: "duniter",
            version: data.software_version,
        })
    }
}

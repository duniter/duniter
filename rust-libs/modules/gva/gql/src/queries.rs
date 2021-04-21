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

pub mod account_balance;
pub mod block;
pub mod current_block;
pub mod current_frame;
pub mod first_utxos_of_scripts;
pub mod gen_tx;
pub mod idty;
pub mod network;
pub mod txs_history;
pub mod uds;
pub mod utxos_of_script;

use crate::*;

#[derive(async_graphql::MergedObject, Default)]
pub struct QueryRoot(
    queries::NodeQuery,
    queries::account_balance::AccountBalanceQuery,
    queries::block::BlockQuery,
    queries::current_block::CurrentBlockQuery,
    queries::current_frame::CurrentFrameQuery,
    queries::first_utxos_of_scripts::FirstUtxosQuery,
    queries::gen_tx::GenTxsQuery,
    queries::idty::IdtyQuery,
    queries::network::NetworkQuery,
    queries::txs_history::TxsHistoryBlockchainQuery,
    queries::txs_history::TxsHistoryMempoolQuery,
    queries::uds::UdsQuery,
    queries::utxos_of_script::UtxosQuery,
);

#[derive(Default, async_graphql::SimpleObject)]
struct NodeQuery {
    node: Node,
}

#[derive(Default)]
struct Node;

#[async_graphql::Object]
impl Node {
    /// Peer card
    async fn peer(
        &self,
        ctx: &async_graphql::Context<'_>,
    ) -> async_graphql::Result<Option<PeerCardGva>> {
        let data = ctx.data::<GvaSchemaData>()?;

        if let Some(self_peer_old) = data
            .cm_accessor()
            .get_self_peer_old(|self_peer_old| self_peer_old.clone())
            .await
        {
            Ok(Some(PeerCardGva::from(self_peer_old)))
        } else {
            Ok(None)
        }
    }
    /// Software
    async fn software(&self) -> &'static str {
        duniter_module::SOFTWARE_NAME
    }
    /// Software version
    async fn version(
        &self,
        ctx: &async_graphql::Context<'_>,
    ) -> async_graphql::Result<&'static str> {
        let data = ctx.data::<GvaSchemaData>()?;
        Ok(data.server_meta_data.software_version)
    }
}

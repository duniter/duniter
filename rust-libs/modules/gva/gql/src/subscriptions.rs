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
pub struct SubscriptionRoot;

#[async_graphql::Subscription]
impl SubscriptionRoot {
    async fn receive_pending_txs(
        &self,
        ctx: &async_graphql::Context<'_>,
    ) -> impl Stream<Item = Vec<TxGva>> {
        let data = ctx.data::<GvaSchemaData>().expect("fail to access db");

        let (s, r) = flume::unbounded();

        data.dbs_pool
            .execute(|dbs| dbs.txs_mp_db.txs().subscribe(s).expect("fail to access db"))
            .await
            .expect("dbs pool disconnected");

        r.into_stream().filter_map(|events| {
            let mut txs = Vec::new();
            for event in events.deref() {
                if let duniter_dbs::databases::txs_mp_v2::TxsEvent::Upsert {
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

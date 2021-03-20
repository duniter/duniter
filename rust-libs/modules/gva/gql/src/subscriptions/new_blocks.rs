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

use super::create_subscription;
use crate::*;
use duniter_dbs::databases::cm_v1::{CmV1DbReadable, CurrentBlockEvent};

#[derive(Clone, Copy, Default)]
pub struct NewBlocksSubscription;

#[async_graphql::Subscription]
impl NewBlocksSubscription {
    async fn new_blocks(
        &self,
        ctx: &async_graphql::Context<'_>,
    ) -> impl Stream<Item = async_graphql::Result<Vec<Block>>> {
        create_subscription(
            ctx,
            |dbs| dbs.cm_db.current_block(),
            |events| {
                let mut blocks = Vec::new();
                for event in events.deref() {
                    if let CurrentBlockEvent::Upsert {
                        value: ref block, ..
                    } = event
                    {
                        blocks.push(Block::from(&block.0));
                    }
                }
                if blocks.is_empty() {
                    futures::future::ready(None)
                } else {
                    futures::future::ready(Some(Ok(blocks)))
                }
            },
        )
        .await
    }
}

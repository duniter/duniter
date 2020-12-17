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

mod new_blocks;
mod receive_pending_txs;

use crate::*;
use futures::future::Either;

#[derive(Clone, Copy, Default, async_graphql::MergedSubscription)]
pub struct SubscriptionRoot(
    new_blocks::NewBlocksSubscription,
    receive_pending_txs::PendingTxsSubscription,
);

pub(crate) async fn create_subscription<C, D, E, F, FC, FUT>(
    ctx: &async_graphql::Context<'_>,
    select_col: FC,
    f: F,
) -> impl Stream<Item = async_graphql::Result<D>>
where
    C: DbCollectionRo<Event = E, K = E::K, V = E::V>,
    E: EventTrait,
    F: FnMut(Arc<Events<E>>) -> FUT,
    FUT: std::future::Future<Output = Option<async_graphql::Result<D>>>,
    FC: 'static + Send + FnOnce(&SharedDbs<FileBackend>) -> &C,
{
    match subscribe_to_col(ctx, select_col).await {
        Ok(r) => Either::Left(r.into_stream().filter_map(f)),
        Err(e) => {
            use futures::FutureExt;
            Either::Right(futures::future::ready(Err(e)).into_stream())
        }
    }
}

async fn subscribe_to_col<C, E, F>(
    ctx: &async_graphql::Context<'_>,
    f: F,
) -> async_graphql::Result<flume::Receiver<Arc<Events<E>>>>
where
    C: DbCollectionRo<Event = E, K = E::K, V = E::V>,
    E: EventTrait,
    F: 'static + Send + FnOnce(&SharedDbs<FileBackend>) -> &C,
{
    let data = ctx.data::<GvaSchemaData>()?;
    let (s, r) = flume::unbounded();
    data.dbs_pool.execute(|dbs| f(dbs).subscribe(s)).await??;
    Ok(r)
}

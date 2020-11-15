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
use duniter_dbs::bc_v2::BcV2DbReadable;

#[derive(Default)]
pub(crate) struct UdsQuery;
#[async_graphql::Object]
impl UdsQuery {
    /// Current universal dividends amount
    async fn current_ud(
        &self,
        ctx: &async_graphql::Context<'_>,
    ) -> async_graphql::Result<Option<CurrentUdGva>> {
        let data = ctx.data::<SchemaData>()?;

        Ok(data
            .dbs_pool
            .execute(move |dbs| duniter_dbs_read_ops::get_current_ud(&dbs.bc_db))
            .await??
            .map(|sa| CurrentUdGva {
                amount: sa.amount(),
                base: sa.base(),
            }))
    }
    /// Universal dividends issued by a public key
    async fn uds_of_pubkey(
        &self,
        ctx: &async_graphql::Context<'_>,
        #[graphql(desc = "Ed25519 public key on base 58 representation")] pubkey: String,
    ) -> async_graphql::Result<Vec<UdGva>> {
        let pubkey = PublicKey::from_base58(&pubkey)?;

        let data = ctx.data::<SchemaData>()?;

        let (uds, _sum) = data
            .dbs_pool
            .execute(move |dbs| {
                duniter_dbs_read_ops::uds_of_pubkey::uds_of_pubkey(
                    &dbs.bc_db,
                    pubkey,
                    ..,
                    None,
                    None,
                    None,
                )
            })
            .await??;

        Ok(uds
            .into_iter()
            .map(|(bn, sa)| UdGva {
                amount: sa.amount(),
                base: sa.base(),
                issuer: pubkey.to_string(),
                block_number: bn.0,
            })
            .collect())
    }
    /// Universal dividends revaluations
    async fn uds_reval(
        &self,
        ctx: &async_graphql::Context<'_>,
    ) -> async_graphql::Result<Vec<RevalUdGva>> {
        let data = ctx.data::<SchemaData>()?;

        Ok(data
            .dbs_pool
            .execute(move |dbs| {
                dbs.bc_db.uds_reval().iter(.., |it| {
                    it.map_ok(|(block_number, sa)| RevalUdGva {
                        amount: sa.0.amount(),
                        base: sa.0.base(),
                        block_number: block_number.0,
                    })
                    .collect::<KvResult<Vec<_>>>()
                })
            })
            .await??)
    }
}

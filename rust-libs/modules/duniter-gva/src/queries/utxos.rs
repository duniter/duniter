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
use async_graphql::connection::*;
use duniter_dbs::GvaV1DbReadable;
use duniter_dbs_read_ops::{
    utxos::{UtxoIdWithBlockNumber, UtxosWithSum},
    PagedData,
};

#[derive(Default)]
pub(crate) struct UtxosQuery;
#[async_graphql::Object]
impl UtxosQuery {
    /// Transactions history
    async fn utxos_of_script(
        &self,
        ctx: &async_graphql::Context<'_>,
        #[graphql(desc = "DUBP wallet script")] script: String,
        #[graphql(desc = "pagination", default)] pagination: PaginationWithStrCursor,
    ) -> async_graphql::Result<Connection<String, UtxoGva, Sum, EmptyFields>> {
        let pagination = PaginationWithStrCursor::convert_to_page_info(pagination);

        let script = dubp::documents_parser::wallet_script_from_str(&script)?;

        let data = ctx.data::<SchemaData>()?;

        let (
            PagedData {
                data: UtxosWithSum { utxos, sum },
                has_previous_page,
                has_next_page,
            },
            times,
        ) = data
            .dbs_pool
            .execute(move |dbs| {
                let paged_data = duniter_dbs_read_ops::utxos::find_script_utxos(
                    &dbs.gva_db,
                    &dbs.txs_mp_db,
                    None,
                    pagination,
                    &script,
                )?;
                let mut times = Vec::with_capacity(paged_data.data.utxos.len());
                for (UtxoIdWithBlockNumber(_utxo_id, bn), _sa) in &paged_data.data.utxos {
                    times.push(
                        dbs.gva_db
                            .blockchain_time()
                            .get(&U32BE(bn.0))?
                            .unwrap_or_else(|| unreachable!()),
                    );
                }
                Ok::<_, anyhow::Error>((paged_data, times))
            })
            .await??;

        let mut conn = Connection::with_additional_fields(
            has_previous_page,
            has_next_page,
            Sum {
                sum: AmountWithBase {
                    amount: sum.amount() as i32,
                    base: sum.base() as i32,
                },
            },
        );
        conn.append(utxos.into_iter().zip(times.into_iter()).map(
            |((utxo_id_with_bn, source_amount), blockchain_time)| {
                Edge::new(
                    utxo_id_with_bn.to_string(),
                    UtxoGva {
                        amount: source_amount.amount(),
                        base: source_amount.base(),
                        tx_hash: utxo_id_with_bn.0.tx_hash.to_hex(),
                        output_index: utxo_id_with_bn.0.output_index as u32,
                        written_time: blockchain_time,
                    },
                )
            },
        ));
        Ok(conn)
    }
}

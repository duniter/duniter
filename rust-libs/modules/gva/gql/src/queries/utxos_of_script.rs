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
use duniter_gva_dbs_reader::{
    utxos::{UtxoCursor, UtxosWithSum},
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
        #[graphql(desc = "DUBP wallet script")] script: PkOrScriptGva,
        #[graphql(desc = "pagination", default)] pagination: Pagination,
        #[graphql(desc = "Amount needed")] amount: Option<i64>,
    ) -> async_graphql::Result<Connection<String, UtxoGva, AggregateSum, EmptyFields>> {
        let pagination = Pagination::convert_to_page_info(pagination)?;

        let data = ctx.data::<GvaSchemaData>()?;
        let db_reader = data.dbs_reader();

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
                if let Some(current_block) = duniter_bc_reader::get_current_block_meta(&dbs.cm_db)?
                {
                    let paged_data = db_reader.find_script_utxos(
                        &dbs.txs_mp_db,
                        amount.map(|amount| {
                            SourceAmount::new(amount, current_block.unit_base as i64)
                        }),
                        pagination,
                        &script.0,
                    )?;
                    let mut times = Vec::with_capacity(paged_data.data.utxos.len());
                    for (UtxoCursor { block_number, .. }, _sa) in &paged_data.data.utxos {
                        times.push(db_reader.get_blockchain_time(*block_number)?);
                    }
                    Ok::<_, anyhow::Error>((paged_data, times))
                } else {
                    Err(anyhow::Error::msg("no blockchain"))
                }
            })
            .await??;

        let mut conn = Connection::with_additional_fields(
            has_previous_page,
            has_next_page,
            AggregateSum {
                aggregate: Sum {
                    sum: AmountWithBase {
                        amount: sum.amount() as i32,
                        base: sum.base() as i32,
                    },
                },
            },
        );
        conn.append(utxos.into_iter().zip(times.into_iter()).map(
            |((utxo_cursor, source_amount), blockchain_time)| {
                Edge::new(
                    utxo_cursor.to_string(),
                    UtxoGva {
                        amount: source_amount.amount(),
                        base: source_amount.base(),
                        tx_hash: utxo_cursor.tx_hash.to_hex(),
                        output_index: utxo_cursor.output_index as u32,
                        written_block: utxo_cursor.block_number.0,
                        written_time: blockchain_time,
                    },
                )
            },
        ));
        Ok(conn)
    }
}

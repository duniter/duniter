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

#[derive(Default)]
pub(crate) struct UtxosQuery;
#[async_graphql::Object]
impl UtxosQuery {
    /// Transactions history
    async fn utxos_of_script(
        &self,
        ctx: &async_graphql::Context<'_>,
        #[graphql(desc = "DUBP wallet script")] script: String,
        after: Option<String>,
        before: Option<String>,
        first: Option<i32>,
        last: Option<i32>,
    ) -> async_graphql::Result<Connection<usize, UtxoGva, EmptyFields, EmptyFields>> {
        let script = dubp::documents_parser::wallet_script_from_str(&script)?;

        let data = ctx.data::<SchemaData>()?;

        let (utxos, _balance) = data
            .dbs_pool
            .execute(move |dbs| duniter_dbs_read_ops::utxos::get_script_utxos(&dbs.gva_db, &script))
            .await??;

        let utxos: Vec<UtxoGva> = utxos
            .into_iter()
            .map(|(written_time, utxo_id, source_amount)| UtxoGva {
                amount: source_amount.amount(),
                base: source_amount.base(),
                tx_hash: utxo_id.tx_hash.to_hex(),
                output_index: utxo_id.output_index as u32,
                written_time,
            })
            .collect();

        query_utxos(after, before, first, last, &utxos).await
    }
}

async fn query_utxos(
    after: Option<String>,
    before: Option<String>,
    first: Option<i32>,
    last: Option<i32>,
    utxos: &[UtxoGva],
) -> async_graphql::Result<Connection<usize, UtxoGva, EmptyFields, EmptyFields>> {
    query(
        after,
        before,
        first,
        last,
        |after, before, first, last| async move {
            let mut start = 0usize;
            let mut end = utxos.len();

            if let Some(after) = after {
                if after >= utxos.len() {
                    return Ok(Connection::new(false, false));
                }
                start = after + 1;
            }

            if let Some(before) = before {
                if before == 0 {
                    return Ok(Connection::new(false, false));
                }
                end = before;
            }

            let mut slice = &utxos[start..end];

            if let Some(first) = first {
                slice = &slice[..first.min(slice.len())];
                end -= first.min(slice.len());
            } else if let Some(last) = last {
                slice = &slice[slice.len() - last.min(slice.len())..];
                start = end - last.min(slice.len());
            }

            let mut connection = Connection::new(start > 0, end < utxos.len());
            connection.append(
                slice
                    .iter()
                    .enumerate()
                    .map(|(idx, item)| Edge::new(start + idx, item.clone())),
            );
            Ok(connection)
        },
    )
    .await
}

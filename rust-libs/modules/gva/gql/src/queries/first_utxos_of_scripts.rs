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
pub(crate) struct FirstUtxosQuery;
#[async_graphql::Object]
impl FirstUtxosQuery {
    /// First utxos of scripts
    async fn first_utxos_of_scripts(
        &self,
        ctx: &async_graphql::Context<'_>,
        #[graphql(
            desc = "DUBP wallets scripts",
            validator(ListMaxLength(length = "100"))
        )]
        scripts: Vec<PkOrScriptGva>,
        #[graphql(
            desc = "Number of first utxos to get ",
            default = 10,
            validator(IntRange(min = "1", max = "40"))
        )]
        first: i32,
    ) -> async_graphql::Result<Vec<UtxosGva>> {
        let scripts: Vec<WalletScriptV10> = scripts.into_iter().map(|script| script.0).collect();

        let data = ctx.data::<GvaSchemaData>()?;
        let db_reader = data.dbs_reader();

        let utxos_matrice: Vec<arrayvec::ArrayVec<_>> = data
            .dbs_pool
            .execute(move |_| db_reader.first_scripts_utxos(first as usize, &scripts))
            .await??;

        Ok(utxos_matrice
            .into_iter()
            .map(|utxos| {
                UtxosGva(
                    utxos
                        .into_iter()
                        .map(|utxo| UtxoGva {
                            amount: utxo.amount.amount(),
                            base: utxo.amount.base(),
                            tx_hash: utxo.tx_hash.to_hex(),
                            output_index: utxo.output_index as u32,
                        })
                        .collect(),
                )
            })
            .collect())
    }
}

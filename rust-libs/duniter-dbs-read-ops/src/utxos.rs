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

use dubp::documents::dubp_wallet::prelude::*;
use duniter_dbs::WalletConditionsV2;

use crate::*;

pub fn get_script_utxos<B: Backend>(
    gva_db_ro: &GvaV1DbRo<B>,
    script: &WalletScriptV10,
) -> KvResult<Vec<(i64, UtxoIdV10, SourceAmount)>> {
    if let Some(utxos_of_script) = gva_db_ro
        .utxos_by_script()
        .get(&WalletConditionsV2::from_ref(script))?
    {
        let mut utxos: Vec<(i64, UtxoIdV10, SourceAmount)> =
            Vec::with_capacity(utxos_of_script.0.len() * 2);
        for (written_time, utxos_) in utxos_of_script.0 {
            for (utxo_id, source_amount) in utxos_ {
                utxos.push((written_time, utxo_id, source_amount));
            }
        }
        Ok(utxos)
    } else {
        Ok(vec![])
    }
}

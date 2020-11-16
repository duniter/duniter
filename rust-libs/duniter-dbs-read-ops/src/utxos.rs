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

pub type UtxoV10 = (i64, UtxoIdV10, SourceAmount);

pub fn get_script_utxos<GvaDb: GvaV1DbReadable>(
    gva_db_ro: &GvaDb,
    script: &WalletScriptV10,
) -> KvResult<(Vec<UtxoV10>, SourceAmount)> {
    find_script_utxos_inner::<_, duniter_dbs::txs_mp_v2::TxsMpV2DbRo<Mem>>(
        gva_db_ro, None, script, None,
    )
}

pub fn find_script_utxos<GvaDb: GvaV1DbReadable, TxsMpDb: TxsMpV2DbReadable>(
    gva_db_ro: &GvaDb,
    txs_mp_db_ro: &TxsMpDb,
    amount: SourceAmount,
    script: &WalletScriptV10,
) -> KvResult<(Vec<UtxoV10>, SourceAmount)> {
    find_script_utxos_inner(gva_db_ro, Some(txs_mp_db_ro), script, Some(amount))
}

fn find_script_utxos_inner<GvaDb: GvaV1DbReadable, TxsMpDb: TxsMpV2DbReadable>(
    gva_db_ro: &GvaDb,
    txs_mp_db_ro: Option<&TxsMpDb>,
    script: &WalletScriptV10,
    total_opt: Option<SourceAmount>,
) -> KvResult<(Vec<UtxoV10>, SourceAmount)> {
    if let Some(utxos_of_script) = gva_db_ro
        .utxos_by_script()
        .get(&WalletConditionsV2::from_ref(script))?
    {
        let mut total = SourceAmount::ZERO;
        let mut utxos: Vec<(i64, UtxoIdV10, SourceAmount)> =
            Vec::with_capacity(utxos_of_script.0.len() * 2);
        for (written_time, utxos_) in utxos_of_script.0 {
            for (utxo_id, source_amount) in utxos_ {
                if txs_mp_db_ro.is_none()
                    || !txs_mp_db_ro
                        .expect("unreachable")
                        .utxos_ids()
                        .contains_key(&duniter_dbs::UtxoIdDbV2(
                            utxo_id.tx_hash,
                            utxo_id.output_index as u32,
                        ))?
                {
                    utxos.push((written_time, utxo_id, source_amount));
                    total = total + source_amount;
                    if let Some(total_target) = total_opt {
                        if total >= total_target {
                            return Ok((utxos, total));
                        }
                    }
                }
            }
        }
        Ok((utxos, total))
    } else {
        Ok((vec![], SourceAmount::ZERO))
    }
}

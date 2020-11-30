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
use duniter_dbs::{GvaUtxoIdDbV1, SourceAmountValV2};

use crate::*;

pub type UtxoV10 = (i64, UtxoIdV10, SourceAmount);

pub fn find_script_utxos<GvaDb: GvaV1DbReadable, TxsMpDb: TxsMpV2DbReadable>(
    gva_db_ro: &GvaDb,
    txs_mp_db_ro: &TxsMpDb,
    amount_target_opt: Option<SourceAmount>,
    script: &WalletScriptV10,
) -> KvResult<(Vec<UtxoV10>, SourceAmount)> {
    let script_hash = Hash::compute(script.to_string().as_bytes());
    let (k_min, k_max) = GvaUtxoIdDbV1::script_interval(script_hash);
    let mut total = SourceAmount::ZERO;

    gva_db_ro.gva_utxos().iter(k_min..k_max, |it| {
        let mut utxos = Vec::new();
        for entry_res in it {
            let (gva_utxo_id, SourceAmountValV2(utxo_amount)) = entry_res?;
            let tx_hash = gva_utxo_id.get_tx_hash();
            let output_index = gva_utxo_id.get_output_index() as u32;
            if !txs_mp_db_ro
                .utxos_ids()
                .contains_key(&UtxoIdDbV2(tx_hash, output_index))?
            {
                utxos.push((
                    gva_db_ro
                        .blockchain_time()
                        .get(&U32BE(gva_utxo_id.get_block_number()))?
                        .ok_or_else(|| {
                            KvError::DbCorrupted(format!(
                                "No gva time for block {}",
                                gva_utxo_id.get_block_number()
                            ))
                        })? as i64,
                    UtxoIdV10 {
                        tx_hash,
                        output_index: output_index as usize,
                    },
                    utxo_amount,
                ));

                total = total + utxo_amount;
                if let Some(total_target) = amount_target_opt {
                    if total >= total_target {
                        return Ok((utxos, total));
                    }
                }
            }
        }
        Ok((utxos, total))
    })
}

#[cfg(test)]
mod tests {

    use super::*;
    use duniter_dbs::GvaV1DbWritable;
    use duniter_dbs::TxsMpV2DbWritable;

    #[test]
    fn test_find_script_utxos() -> KvResult<()> {
        let script = WalletScriptV10::single_sig(PublicKey::default());

        let gva_db = duniter_dbs::gva_v1::GvaV1Db::<Mem>::open(MemConf::default())?;
        let txs_mp_db = duniter_dbs::txs_mp_v2::TxsMpV2Db::<Mem>::open(MemConf::default())?;

        gva_db.blockchain_time_write().upsert(U32BE(0), 1)?;
        gva_db.gva_utxos_write().upsert(
            GvaUtxoIdDbV1::new(script.clone(), 0, Hash::default(), 0),
            SourceAmountValV2(SourceAmount::with_base0(50)),
        )?;
        gva_db.gva_utxos_write().upsert(
            GvaUtxoIdDbV1::new(script.clone(), 0, Hash::default(), 1),
            SourceAmountValV2(SourceAmount::with_base0(80)),
        )?;

        let utxos = find_script_utxos(
            &gva_db,
            &txs_mp_db,
            Some(SourceAmount::with_base0(55)),
            &script,
        )?;

        assert_eq!(
            utxos.0,
            vec![
                (
                    1,
                    UtxoIdV10 {
                        tx_hash: Hash::default(),
                        output_index: 0
                    },
                    SourceAmount::with_base0(50)
                ),
                (
                    1,
                    UtxoIdV10 {
                        tx_hash: Hash::default(),
                        output_index: 1
                    },
                    SourceAmount::with_base0(80)
                ),
            ]
        );
        assert_eq!(utxos.1, SourceAmount::with_base0(130));

        Ok(())
    }
}

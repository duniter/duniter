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
use duniter_dbs::GvaUtxoIdDbV1;

pub(crate) fn write_utxo_v10<'s, B: Backend>(
    scripts_by_pubkey: &mut TxColRw<B::Col, duniter_dbs::databases::gva_v1::ScriptsByPubkeyEvent>,
    gva_utxos: &mut TxColRw<B::Col, duniter_dbs::databases::gva_v1::GvaUtxosEvent>,
    utxo: UtxoV10<'s>,
    utxo_script_hash: Hash,
) -> KvResult<()> {
    for pubkey in utxo.script.pubkeys() {
        let mut pubkey_scripts = scripts_by_pubkey
            .get(&PubKeyKeyV2(pubkey))?
            .unwrap_or_default();
        if !pubkey_scripts.0.contains(&utxo.script) {
            pubkey_scripts.0.insert(utxo.script.clone());
            scripts_by_pubkey.upsert(PubKeyKeyV2(pubkey), pubkey_scripts);
        }
    }

    let block_number = utxo.written_block.0;
    let utxo_amount = utxo.amount;
    let utxo_id = utxo.id;
    gva_utxos.upsert(
        GvaUtxoIdDbV1::new_(
            utxo_script_hash,
            block_number,
            utxo_id.tx_hash,
            utxo_id.output_index as u8,
        ),
        SourceAmountValV2(utxo_amount),
    );

    Ok(())
}

pub(crate) fn remove_utxo_v10<B: Backend>(
    scripts_by_pubkey: &mut TxColRw<B::Col, duniter_dbs::databases::gva_v1::ScriptsByPubkeyEvent>,
    gva_utxos: &mut TxColRw<B::Col, duniter_dbs::databases::gva_v1::GvaUtxosEvent>,
    utxo_id: UtxoIdV10,
    utxo_script: &WalletScriptV10,
    utxo_script_hash: Hash,
    written_block_number: u32,
) -> KvResult<()> {
    gva_utxos.remove(GvaUtxoIdDbV1::new_(
        utxo_script_hash,
        written_block_number,
        utxo_id.tx_hash,
        utxo_id.output_index as u8,
    ));

    let (k_min, k_max) = GvaUtxoIdDbV1::script_interval(utxo_script_hash);
    if gva_utxos
        .iter(k_min..k_max, |it| it.keys().next_res())?
        .is_none()
    {
        let pubkeys = utxo_script.pubkeys();
        for pubkey in pubkeys {
            let mut pubkey_scripts =
                scripts_by_pubkey
                    .get(&PubKeyKeyV2(pubkey))?
                    .ok_or_else(|| {
                        KvError::DbCorrupted(format!(
                            "GVA: key {} dont exist on col `scripts_by_pubkey`.",
                            pubkey,
                        ))
                    })?;
            pubkey_scripts.0.remove(utxo_script);
            scripts_by_pubkey.upsert(PubKeyKeyV2(pubkey), pubkey_scripts);
        }
    }
    Ok(())
}

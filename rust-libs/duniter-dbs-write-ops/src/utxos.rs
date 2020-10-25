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

pub struct UtxoV10 {
    pub id: UtxoIdV10,
    pub amount: SourceAmount,
    pub script: WalletScriptV10,
    pub written_time: i64,
}

pub(crate) fn write_utxo_v10<B: Backend>(
    scripts_by_pubkey: &mut TxColRw<B::Col, duniter_dbs::gva_v1::ScriptsByPubkeyEvent>,
    utxos_by_script: &mut TxColRw<B::Col, duniter_dbs::gva_v1::UtxosByScriptEvent>,
    utxo: UtxoV10,
) -> KvResult<()> {
    for pubkey in utxo.script.pubkeys() {
        let mut pubkey_scripts = scripts_by_pubkey
            .get(&PubKeyKeyV2(pubkey))?
            .unwrap_or_default();
        pubkey_scripts.0.insert(utxo.script.clone());
        scripts_by_pubkey.upsert(PubKeyKeyV2(pubkey), pubkey_scripts);
    }
    let mut utxo_of_script = utxos_by_script
        .get(WalletConditionsV2::from_ref(&utxo.script))?
        .unwrap_or_default();
    utxo_of_script
        .0
        .entry(utxo.written_time)
        .or_default()
        .push((utxo.id, utxo.amount));
    utxos_by_script.upsert(WalletConditionsV2(utxo.script), utxo_of_script);

    Ok(())
}

pub(crate) fn remove_utxo_v10<B: Backend>(
    scripts_by_pubkey: &mut TxColRw<B::Col, duniter_dbs::gva_v1::ScriptsByPubkeyEvent>,
    utxos_by_script: &mut TxColRw<B::Col, duniter_dbs::gva_v1::UtxosByScriptEvent>,
    utxo_script: &WalletScriptV10,
    written_time: i64,
) -> KvResult<()> {
    if let Some(mut utxos_of_script) =
        utxos_by_script.get(&WalletConditionsV2::from_ref(utxo_script))?
    {
        utxos_of_script.0.remove(&written_time);
        if utxos_of_script.0.is_empty() {
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
        utxos_by_script.upsert(WalletConditionsV2(utxo_script.clone()), utxos_of_script);
    }
    Ok(())
}

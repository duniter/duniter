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

db_schema!(
    GvaV1,
    [
        ["txs", Txs, HashKeyV2, TxDbV2],
        ["txs_by_issuer", TxsByIssuer, PubKeyKeyV2, BTreeSet<Hash>],
        ["txs_by_recipient", TxsByRecipient, PubKeyKeyV2, BTreeSet<Hash>],
        [
            "scripts_by_pubkey",
            ScriptsByPubkey,
            PubKeyKeyV2,
            WalletScriptArrayV2
        ],
        [
            "utxos_by_script",
            UtxosByScript,
            WalletConditionsV2,
            UtxosOfScriptV1
        ],
        ["balances", Balances, WalletConditionsV2, SourceAmountValV2],
        ["gva_identities", GvaIdentities, PubKeyKeyV2, GvaIdtyDbV1],
    ]
);

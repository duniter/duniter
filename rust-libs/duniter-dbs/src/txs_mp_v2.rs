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
    TxsMpV2,
    [
        ["txs", Txs, HashKeyV2, PendingTxDbV2],
        ["txs_by_issuer", TxsByIssuer, PubKeyKeyV2, BTreeSet<Hash>],
        ["txs_by_recipient", TxsByRecipient, PubKeyKeyV2, BTreeSet<Hash>],
        ["txs_by_received_time", TxsByRecvTime, i64, BTreeSet<Hash>],
        ["uds_ids", UdsIds, UdIdV2, ()],
        ["utxos_ids", UtxosIds, UtxoIdDbV2, ()],
    ]
);

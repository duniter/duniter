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
        ["txs", txs, HashKeyV2, PendingTxDbV2,],
        ["txs_by_issuer", txs_by_issuer, PubKeyKeyV2, HashBTSetV2,],
        [
            "txs_by_recipient",
            txs_by_recipient,
            PubKeyKeyV2,
            HashBTSetV2,
        ],
        ["txs_by_received_time", txs_by_recv_time, i64, HashBTSetV2,],
    ]
);

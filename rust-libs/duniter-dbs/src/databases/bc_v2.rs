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
    BcV2,
    [
        ["blocks_meta", BlocksMeta, U32BE, BlockMetaV2],
        ["identities", Identities, PubKeyKeyV2, IdtyDbV2],
        ["txs_hashs", TxsHashs, HashKeyV2, ()],
        ["uds", Uds, UdIdV2, ()],
        ["uds_reval", UdsReval, U32BE, SourceAmountValV2],
        ["uids_index", UidsIndex, String, PubKeyValV2],
        ["utxos", Utxos, UtxoIdDbV2, WalletScriptWithSourceAmountV1Db],
        ["consumed_utxos", ConsumedUtxos, U32BE, BlockUtxosV2Db],
    ]
);

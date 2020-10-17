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

#![deny(
    clippy::unwrap_used,
    missing_copy_implementations,
    trivial_casts,
    trivial_numeric_casts,
    unstable_features,
    unused_import_braces
)]

pub mod txs_history;
pub mod utxos;

use dubp::common::crypto::hashs::Hash;
use dubp::common::crypto::keys::ed25519::PublicKey;
use dubp::documents::transaction::TransactionDocumentV10;
use duniter_dbs::{
    kv_typed::prelude::*,
    //BlockNumberArrayV2, BlockNumberKeyV2, SourceAmountValV2, UtxosOfScriptV1
    //GvaV1Db,
    GvaV1DbReadable,
    GvaV1DbRo,
    //GvaV1DbWritable,
    HashKeyV2,
    //PendingTxDbV2,
    PubKeyKeyV2,
    TxDbV2,
    //TxsMpV2Db,
    TxsMpV2DbReadable,
    TxsMpV2DbRo,
    //TxsMpV2DbWritable,
    //WalletConditionsV2,
};

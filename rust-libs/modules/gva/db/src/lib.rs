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

mod keys;
mod values;

pub use keys::gva_utxo_id::GvaUtxoIdDbV1;
pub use keys::wallet_hash_with_bn::WalletHashWithBnV1Db;
pub use values::gva_idty_db::GvaIdtyDbV1;
pub use values::gva_tx::GvaTxDbV1;
pub use values::wallet_script_array::WalletScriptArrayV2;

pub(crate) use dubp::common::prelude::*;
pub(crate) use dubp::crypto::hashs::Hash;
pub(crate) use dubp::wallet::prelude::*;
pub(crate) use duniter_dbs::smallvec::SmallVec;
pub(crate) use duniter_dbs::{
    CorruptedBytes, HashKeyV2, PubKeyKeyV2, SourceAmountValV2, ToDumpString, WalletConditionsV2,
};
pub(crate) use kv_typed::db_schema;
pub(crate) use kv_typed::prelude::*;
pub(crate) use serde::{Deserialize, Serialize};
pub(crate) use std::collections::BTreeSet;

db_schema!(
    GvaV1,
    [
        ["blocks_with_ud", BlocksWithUd, U32BE, ()],
        ["blockchain_time", BlockchainTime, U32BE, u64],
        ["txs", Txs, HashKeyV2, GvaTxDbV1],
        ["txs_by_issuer", TxsByIssuer, WalletHashWithBnV1Db, BTreeSet<Hash>],
        ["txs_by_recipient", TxsByRecipient, WalletHashWithBnV1Db, BTreeSet<Hash>],
        [
            "scripts_by_pubkey",
            ScriptsByPubkey,
            PubKeyKeyV2,
            WalletScriptArrayV2
        ],
        [
            "gva_utxos",
            GvaUtxos,
            GvaUtxoIdDbV1,
            SourceAmountValV2
        ],
        ["balances", Balances, WalletConditionsV2, SourceAmountValV2],
        ["gva_identities", GvaIdentities, PubKeyKeyV2, GvaIdtyDbV1],
    ]
);

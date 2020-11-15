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

pub mod find_inputs;
pub mod txs_history;
pub mod uds_of_pubkey;
pub mod utxos;

use dubp::common::crypto::hashs::Hash;
use dubp::common::crypto::keys::ed25519::PublicKey;
use dubp::documents::transaction::TransactionDocumentV10;
use dubp::{common::prelude::BlockNumber, wallet::prelude::SourceAmount};
use duniter_dbs::bc_v2::BcV2DbReadable;
use duniter_dbs::{
    kv_typed::prelude::*, BlockMetaV2, GvaV1DbReadable, HashKeyV2, PubKeyKeyV2, TxDbV2,
    TxsMpV2DbReadable,
};
use resiter::map::Map;
use std::{
    collections::BTreeSet,
    ops::{Bound, RangeBounds},
};

pub fn get_current_block_meta<BcDb: BcV2DbReadable>(bc_db: &BcDb) -> KvResult<Option<BlockMetaV2>> {
    bc_db
        .blocks_meta()
        .iter(.., |it| it.reverse().values().next_res())
}

pub fn get_current_ud<BcDb: BcV2DbReadable>(bc_db: &BcDb) -> KvResult<Option<SourceAmount>> {
    bc_db
        .uds_reval()
        .iter(.., |it| it.reverse().values().map_ok(|v| v.0).next_res())
}

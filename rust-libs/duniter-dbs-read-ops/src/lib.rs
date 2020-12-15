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

use dubp::crypto::hashs::Hash;
use duniter_dbs::{
    databases::{bc_v2::BcV2DbReadable, cm_v1::CmV1DbReadable},
    kv_typed::prelude::*,
    BlockMetaV2, HashKeyV2,
};

pub fn get_current_block_meta<CmDb: CmV1DbReadable>(cm_db: &CmDb) -> KvResult<Option<BlockMetaV2>> {
    cm_db.current_block_meta().get(&())
}

pub fn tx_exist<BcDb: BcV2DbReadable>(bc_db_ro: &BcDb, hash: Hash) -> KvResult<bool> {
    Ok(bc_db_ro.txs_hashs().contains_key(&HashKeyV2(hash))?)
}

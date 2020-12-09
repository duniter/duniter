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

pub mod apply_block;
pub mod bc;
pub mod txs_mp;

use std::borrow::Cow;

use dubp::block::prelude::*;
use dubp::common::crypto::hashs::Hash;
use dubp::common::prelude::*;
use dubp::documents::{
    prelude::*, smallvec::SmallVec, transaction::TransactionDocumentTrait,
    transaction::TransactionDocumentV10,
};
use dubp::wallet::prelude::*;
use duniter_dbs::{
    databases::{
        bc_v2::BcV2Db,
        txs_mp_v2::{TxsMpV2Db, TxsMpV2DbReadable, TxsMpV2DbWritable},
    },
    kv_typed::prelude::*,
    BlockMetaV2, FileBackend, HashKeyV2, PendingTxDbV2, PubKeyKeyV2, PubKeyValV2, SharedDbs,
    SourceAmountValV2, UtxoValV2, WalletConditionsV2,
};
use resiter::filter_map::FilterMap;
use resiter::flatten::Flatten;
use resiter::map::Map;
use std::ops::Deref;

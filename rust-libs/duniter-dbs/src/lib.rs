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

pub mod databases;
mod keys;
mod open_dbs;
mod values;

// Re-export dependencies
pub use arrayvec;
#[cfg(feature = "explorer")]
pub use kv_typed::regex;
pub use serde;
pub use serde_json;
pub use smallvec;

// Re-export crates
pub use kv_typed;

// Prelude
pub mod prelude {
    pub use crate::open_dbs::BackendConf;
    pub use crate::SharedDbs;
    #[cfg(feature = "explorer")]
    pub use kv_typed::explorer::{
        DbExplorable, EntryFound, ExplorerAction, ExplorerActionResponse, ValueCaptures,
    };
}

// Export technical types and functions
pub use crate::open_dbs::open_dbs;

// Export profession types
pub use crate::keys::utxo_id::UtxoIdDbV2;
pub use keys::all::AllKeyV1;
pub use keys::block_number::BlockNumberKeyV1;
pub use keys::blockstamp::BlockstampKeyV1;
pub use keys::dunp_node_id::DunpNodeIdV1Db;
pub use keys::hash::{HashKeyV1, HashKeyV2};
pub use keys::pubkey::{PubKeyKeyV1, PubKeyKeyV2};
pub use keys::pubkey_and_sig::PubKeyAndSigV1;
pub use keys::source_key::SourceKeyV1;
pub use keys::timestamp::TimestampKeyV1;
pub use keys::ud_id::UdIdV2;
pub use keys::uid::UidKeyV1;
pub use keys::utxo_id::GvaUtxoIdDbV1;
pub use keys::wallet_conditions::{WalletConditionsV1, WalletConditionsV2};
pub use values::block_db::{BlockDbEnum, BlockDbV1, TransactionInBlockDbV1};
pub use values::block_head_db::BlockHeadDbV1;
pub use values::block_meta::BlockMetaV2;
pub use values::block_number_array_db::BlockNumberArrayV1;
pub use values::cindex_db::CIndexDbV1;
pub use values::dunp_head::DunpHeadDbV1;
pub use values::gva_idty_db::GvaIdtyDbV1;
pub use values::idty_db::IdtyDbV2;
pub use values::iindex_db::IIndexDbV1;
pub use values::kick_db::KickDbV1;
pub use values::mindex_db::MIndexDbV1;
pub use values::peer_card::PeerCardDbV1;
pub use values::pubkey_db::{PubKeyValV2, PublicKeyArrayDbV1, PublicKeySingletonDbV1};
pub use values::sindex_db::{SIndexDBV1, SourceKeyArrayDbV1};
pub use values::source_amount::SourceAmountValV2;
pub use values::tx_db::{PendingTxDbV2, TxDbV2};
pub use values::ud_entry_db::{ConsumedUdDbV1, UdAmountDbV1, UdEntryDbV1};
pub use values::utxo::{BlockUtxosV2Db, UtxoValV2};
pub use values::wallet_db::WalletDbV1;
pub use values::wallet_script_array::WalletScriptArrayV2;
pub use values::wallet_script_with_sa::WalletScriptWithSourceAmountV1Db;

// Crate imports
pub(crate) use arrayvec::{ArrayString, ArrayVec};
#[cfg(feature = "explorer")]
use chrono::NaiveDateTime;
pub(crate) use dubp::common::crypto::bases::b58::ToBase58 as _;
pub(crate) use dubp::common::crypto::bases::BaseConversionError;
pub(crate) use dubp::common::crypto::hashs::Hash;
pub(crate) use dubp::common::crypto::keys::ed25519::{PublicKey, Signature};
pub(crate) use dubp::common::crypto::keys::{PublicKey as _, Signature as _};
pub(crate) use dubp::common::prelude::*;
pub(crate) use dubp::documents::dubp_wallet::prelude::*;
pub(crate) use kv_typed::db_schema;
pub(crate) use kv_typed::prelude::*;
pub(crate) use serde::{Deserialize, Serialize};
pub(crate) use smallvec::SmallVec;
pub(crate) use std::{
    collections::BTreeSet, convert::TryFrom, fmt::Debug, iter::Iterator, path::Path, str::FromStr,
};

pub trait ToDumpString {
    fn to_dump_string(&self) -> String;
}

#[cfg(all(not(feature = "mem"), not(test)))]
pub type FileBackend = kv_typed::backend::sled::Sled;
#[cfg(any(feature = "mem", test))]
pub type FileBackend = kv_typed::backend::memory::Mem;

#[derive(Clone, Debug)]
pub struct SharedDbs<B: Backend> {
    pub bc_db_ro: databases::bc_v2::BcV2DbRo<B>,
    pub cm_db: databases::cm_v1::CmV1Db<Mem>,
    pub dunp_db: databases::dunp_v1::DunpV1Db<B>,
    pub txs_mp_db: databases::txs_mp_v2::TxsMpV2Db<B>,
}

impl SharedDbs<Mem> {
    pub fn mem() -> KvResult<Self> {
        use databases::bc_v2::BcV2DbWritable as _;
        use databases::cm_v1::CmV1DbWritable as _;
        use databases::dunp_v1::DunpV1DbWritable as _;
        use databases::txs_mp_v2::TxsMpV2DbWritable as _;
        Ok(SharedDbs {
            bc_db_ro: databases::bc_v2::BcV2Db::<Mem>::open(MemConf::default())?.get_ro_handler(),
            cm_db: databases::cm_v1::CmV1Db::<Mem>::open(MemConf::default())?,
            dunp_db: databases::dunp_v1::DunpV1Db::<Mem>::open(MemConf::default())?,
            txs_mp_db: databases::txs_mp_v2::TxsMpV2Db::<Mem>::open(MemConf::default())?,
        })
    }
}

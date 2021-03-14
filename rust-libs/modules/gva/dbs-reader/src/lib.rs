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

pub mod block;
pub mod current_frame;
pub mod find_inputs;
pub mod idty;
pub mod pagination;
pub mod txs_history;
pub mod uds_of_pubkey;
pub mod utxos;

pub use crate::pagination::{PageInfo, PagedData};

use crate::pagination::{has_next_page, has_previous_page};
use arrayvec::ArrayVec;
use dubp::common::crypto::keys::ed25519::PublicKey;
use dubp::documents::transaction::TransactionDocumentV10;
use dubp::{block::DubpBlockV10, common::crypto::hashs::Hash};
use dubp::{common::prelude::BlockNumber, wallet::prelude::*};
use duniter_dbs::FileBackend;
use duniter_dbs::{
    databases::{
        bc_v2::{BcV2DbReadable, BcV2DbRo},
        cm_v1::CmV1DbReadable,
        txs_mp_v2::TxsMpV2DbReadable,
    },
    BlockMetaV2,
};
use duniter_dbs::{kv_typed::prelude::*, HashKeyV2, PubKeyKeyV2, SourceAmountValV2, UtxoIdDbV2};
use duniter_gva_db::{GvaIdtyDbV1, GvaTxDbV1, GvaUtxoIdDbV1, GvaV1DbReadable, GvaV1DbRo};
use resiter::filter::Filter;
use resiter::filter_map::FilterMap;
use resiter::flatten::Flatten;
use resiter::map::Map;
use std::{
    collections::{BTreeSet, VecDeque},
    num::NonZeroUsize,
    str::FromStr,
};

#[derive(Clone, Copy, Debug)]
pub struct WrongCursor;
impl std::fmt::Display for WrongCursor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "wrong cursor")
    }
}
impl std::error::Error for WrongCursor {}

#[derive(Clone, Copy, Debug)]
pub struct DbsReader(&'static GvaV1DbRo<FileBackend>);

pub fn create_dbs_reader(gva_db_ro: &'static GvaV1DbRo<FileBackend>) -> DbsReader {
    DbsReader(gva_db_ro)
}

impl DbsReader {
    pub fn get_account_balance(
        &self,
        account_script: &WalletScriptV10,
    ) -> KvResult<Option<SourceAmountValV2>> {
        self.0
            .balances()
            .get(duniter_dbs::WalletConditionsV2::from_ref(account_script))
    }

    pub fn get_current_block<CmDb: CmV1DbReadable>(
        &self,
        cm_db: &CmDb,
    ) -> KvResult<Option<DubpBlockV10>> {
        Ok(cm_db.current_block().get(&())?.map(|db_block| db_block.0))
    }

    pub fn get_current_block_meta<CmDb: CmV1DbReadable>(
        &self,
        cm_db: &CmDb,
    ) -> KvResult<Option<BlockMetaV2>> {
        cm_db.current_block_meta().get(&())
    }

    pub fn get_current_ud<BcDb: BcV2DbReadable>(
        &self,
        bc_db: &BcDb,
    ) -> KvResult<Option<SourceAmount>> {
        bc_db
            .uds_reval()
            .iter_rev(.., |it| it.values().map_ok(|v| v.0).next_res())
    }

    pub fn get_blockchain_time(&self, block_number: BlockNumber) -> anyhow::Result<u64> {
        Ok(self
            .0
            .blockchain_time()
            .get(&U32BE(block_number.0))?
            .unwrap_or_else(|| unreachable!()))
    }
}

#[cfg(test)]
impl DbsReader {
    pub(crate) fn mem() -> Self {
        use duniter_gva_db::GvaV1DbWritable;
        let gva_db = duniter_gva_db::GvaV1Db::<Mem>::open(MemConf::default())
            .expect("fail to create memory gva db");
        create_dbs_reader(unsafe { std::mem::transmute(&gva_db.get_ro_handler()) })
    }
}

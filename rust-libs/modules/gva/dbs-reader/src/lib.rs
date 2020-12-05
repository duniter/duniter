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
pub mod pagination;
pub mod txs_history;
pub mod uds_of_pubkey;
pub mod utxos;

pub use crate::pagination::{PageInfo, PagedData};

use crate::pagination::{has_next_page, has_previous_page};
use dubp::common::crypto::hashs::Hash;
use dubp::common::crypto::keys::ed25519::PublicKey;
use dubp::documents::transaction::TransactionDocumentV10;
use dubp::{common::prelude::BlockNumber, wallet::prelude::*};
use duniter_dbs::bc_v2::{BcV2DbReadable, BcV2DbRo};
use duniter_dbs::{gva_v1::GvaV1DbRo, FileBackend};
use duniter_dbs::{
    kv_typed::prelude::*, GvaV1DbReadable, HashKeyV2, PubKeyKeyV2, SourceAmountValV2, TxDbV2,
    TxsMpV2DbReadable, UtxoIdDbV2,
};
use resiter::filter::Filter;
use resiter::filter_map::FilterMap;
use resiter::map::Map;
use std::{collections::BTreeSet, str::FromStr};

pub(crate) fn wrong_cursor() -> StringErr {
    StringErr("wrong cursor".to_owned())
}

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

    pub fn get_current_ud<BcDb: BcV2DbReadable>(
        &self,
        bc_db: &BcDb,
    ) -> KvResult<Option<SourceAmount>> {
        bc_db
            .uds_reval()
            .iter(.., |it| it.reverse().values().map_ok(|v| v.0).next_res())
    }

    pub fn get_blockchain_time(&self, block_number: BlockNumber) -> anyhow::Result<u64> {
        Ok(self
            .0
            .blockchain_time()
            .get(&U32BE(block_number.0))?
            .unwrap_or_else(|| unreachable!()))
    }
}

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
pub mod network;
pub mod pagination;
pub mod txs_history;
pub mod uds_of_pubkey;
pub mod utxos;

pub use crate::pagination::{PageInfo, PagedData};
pub use duniter_bca_types::MAX_FIRST_UTXOS;

use crate::pagination::{has_next_page, has_previous_page};
use arrayvec::ArrayVec;
use dubp::common::crypto::keys::ed25519::PublicKey;
use dubp::documents::transaction::TransactionDocumentV10;
use dubp::{block::DubpBlockV10, common::crypto::hashs::Hash};
use dubp::{common::prelude::BlockNumber, wallet::prelude::*};
use duniter_bca_types::utxo::Utxo;
use duniter_dbs::{databases::dunp_v1::DunpV1DbReadable, FileBackend};
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

#[cfg_attr(feature = "mock", mockall::automock)]
pub trait DbsReader {
    fn all_uds_of_pubkey(
        &self,
        bc_db: &BcV2DbRo<FileBackend>,
        pubkey: PublicKey,
        page_info: PageInfo<BlockNumber>,
    ) -> KvResult<PagedData<uds_of_pubkey::UdsWithSum>>;
    fn block(&self, bc_db: &BcV2DbRo<FileBackend>, number: U32BE) -> KvResult<Option<BlockMetaV2>>;
    fn blocks(
        &self,
        bc_db: &BcV2DbRo<FileBackend>,
        page_info: PageInfo<block::BlockCursor>,
    ) -> KvResult<PagedData<Vec<(block::BlockCursor, BlockMetaV2)>>>;
    fn endpoints<Db: 'static + DunpV1DbReadable>(
        &self,
        network_db: &Db,
        api_list: Vec<String>,
    ) -> KvResult<Vec<String>>;
    fn find_inputs<TxsMpDb: 'static + TxsMpV2DbReadable>(
        &self,
        bc_db: &BcV2DbRo<FileBackend>,
        txs_mp_db: &TxsMpDb,
        amount: SourceAmount,
        script: &WalletScriptV10,
        use_mempool_sources: bool,
    ) -> anyhow::Result<(
        Vec<dubp::documents::transaction::TransactionInputV10>,
        SourceAmount,
    )>;
    fn find_script_utxos<TxsMpDb: 'static + TxsMpV2DbReadable>(
        &self,
        txs_mp_db_ro: &TxsMpDb,
        amount_target_opt: Option<SourceAmount>,
        page_info: PageInfo<utxos::UtxoCursor>,
        script: &WalletScriptV10,
    ) -> anyhow::Result<PagedData<utxos::UtxosWithSum>>;
    fn first_scripts_utxos(
        &self,
        amount_target_opt: Option<SourceAmount>,
        first: usize,
        scripts: &[WalletScriptV10],
    ) -> anyhow::Result<Vec<arrayvec::ArrayVec<[Utxo; MAX_FIRST_UTXOS]>>>;
    fn get_account_balance(
        &self,
        account_script: &WalletScriptV10,
    ) -> KvResult<Option<SourceAmountValV2>>;
    fn get_blockchain_time(&self, block_number: BlockNumber) -> anyhow::Result<u64>;
    fn get_current_block<CmDb: 'static + CmV1DbReadable>(
        &self,
        cm_db: &CmDb,
    ) -> KvResult<Option<DubpBlockV10>>;
    fn get_current_frame<BcDb: 'static + BcV2DbReadable>(
        &self,
        bc_db: &BcDb,
        current_block_meta: &BlockMetaV2,
    ) -> anyhow::Result<Vec<BlockMetaV2>>;
    fn get_txs_history_bc_received(
        &self,
        from: Option<u64>,
        page_info: PageInfo<txs_history::TxBcCursor>,
        script_hash: Hash,
        to: Option<u64>,
    ) -> KvResult<PagedData<VecDeque<duniter_gva_db::GvaTxDbV1>>>;
    fn get_txs_history_bc_sent(
        &self,
        from: Option<u64>,
        page_info: PageInfo<txs_history::TxBcCursor>,
        script_hash: Hash,
        to: Option<u64>,
    ) -> KvResult<PagedData<VecDeque<duniter_gva_db::GvaTxDbV1>>>;
    fn get_txs_history_mempool<TxsMpDb: 'static + TxsMpV2DbReadable>(
        &self,
        txs_mp_db_ro: &TxsMpDb,
        pubkey: PublicKey,
    ) -> KvResult<(Vec<TransactionDocumentV10>, Vec<TransactionDocumentV10>)>;
    fn idty(
        &self,
        bc_db: &BcV2DbRo<FileBackend>,
        pubkey: PublicKey,
    ) -> KvResult<Option<duniter_dbs::IdtyDbV2>>;
    fn peers_and_heads<DB: 'static + DunpV1DbReadable>(
        &self,
        dunp_db: &DB,
    ) -> KvResult<Vec<(duniter_dbs::PeerCardDbV1, Vec<duniter_dbs::DunpHeadDbV1>)>>;
    fn unspent_uds_of_pubkey(
        &self,
        bc_db: &BcV2DbRo<FileBackend>,
        pubkey: PublicKey,
        page_info: PageInfo<BlockNumber>,
        bn_to_exclude_opt: Option<std::collections::BTreeSet<BlockNumber>>,
        amount_target_opt: Option<SourceAmount>,
    ) -> KvResult<PagedData<uds_of_pubkey::UdsWithSum>>;
}

#[derive(Clone, Copy, Debug)]
pub struct DbsReaderImpl(&'static GvaV1DbRo<FileBackend>);

pub fn create_dbs_reader(gva_db_ro: &'static GvaV1DbRo<FileBackend>) -> DbsReaderImpl {
    DbsReaderImpl(gva_db_ro)
}

impl DbsReader for DbsReaderImpl {
    fn all_uds_of_pubkey(
        &self,
        bc_db: &BcV2DbRo<FileBackend>,
        pubkey: PublicKey,
        page_info: PageInfo<BlockNumber>,
    ) -> KvResult<PagedData<uds_of_pubkey::UdsWithSum>> {
        self.all_uds_of_pubkey_(bc_db, pubkey, page_info)
    }

    fn block(&self, bc_db: &BcV2DbRo<FileBackend>, number: U32BE) -> KvResult<Option<BlockMetaV2>> {
        self.block_(bc_db, number)
    }

    fn blocks(
        &self,
        bc_db: &BcV2DbRo<FileBackend>,
        page_info: PageInfo<block::BlockCursor>,
    ) -> KvResult<PagedData<Vec<(block::BlockCursor, BlockMetaV2)>>> {
        self.blocks_(bc_db, page_info)
    }

    fn endpoints<Db: 'static + DunpV1DbReadable>(
        &self,
        network_db: &Db,
        api_list: Vec<String>,
    ) -> KvResult<Vec<String>> {
        self.endpoints_(network_db, api_list)
    }

    fn find_inputs<TxsMpDb: 'static + TxsMpV2DbReadable>(
        &self,
        bc_db: &BcV2DbRo<FileBackend>,
        txs_mp_db: &TxsMpDb,
        amount: SourceAmount,
        script: &WalletScriptV10,
        use_mempool_sources: bool,
    ) -> anyhow::Result<(
        Vec<dubp::documents::transaction::TransactionInputV10>,
        SourceAmount,
    )> {
        self.find_inputs_(bc_db, txs_mp_db, amount, script, use_mempool_sources)
    }

    fn find_script_utxos<TxsMpDb: 'static + TxsMpV2DbReadable>(
        &self,
        txs_mp_db_ro: &TxsMpDb,
        amount_target_opt: Option<SourceAmount>,
        page_info: PageInfo<utxos::UtxoCursor>,
        script: &WalletScriptV10,
    ) -> anyhow::Result<PagedData<utxos::UtxosWithSum>> {
        self.find_script_utxos_(txs_mp_db_ro, amount_target_opt, page_info, script)
    }

    fn first_scripts_utxos(
        &self,
        amount_target_opt: Option<SourceAmount>,
        first: usize,
        scripts: &[WalletScriptV10],
    ) -> anyhow::Result<Vec<ArrayVec<[Utxo; MAX_FIRST_UTXOS]>>> {
        self.first_scripts_utxos_(amount_target_opt, first, scripts)
    }

    fn get_account_balance(
        &self,
        account_script: &WalletScriptV10,
    ) -> KvResult<Option<SourceAmountValV2>> {
        self.0
            .balances()
            .get(duniter_dbs::WalletConditionsV2::from_ref(account_script))
    }

    fn get_blockchain_time(&self, block_number: BlockNumber) -> anyhow::Result<u64> {
        Ok(self
            .0
            .blockchain_time()
            .get(&U32BE(block_number.0))?
            .unwrap_or_else(|| unreachable!()))
    }

    fn get_current_block<CmDb: CmV1DbReadable>(
        &self,
        cm_db: &CmDb,
    ) -> KvResult<Option<DubpBlockV10>> {
        Ok(cm_db.current_block().get(&())?.map(|db_block| db_block.0))
    }

    fn get_current_frame<BcDb: 'static + BcV2DbReadable>(
        &self,
        bc_db: &BcDb,
        current_block_meta: &BlockMetaV2,
    ) -> anyhow::Result<Vec<BlockMetaV2>> {
        self.get_current_frame_(bc_db, current_block_meta)
    }

    fn get_txs_history_bc_received(
        &self,
        from: Option<u64>,
        page_info: PageInfo<txs_history::TxBcCursor>,
        script_hash: Hash,
        to: Option<u64>,
    ) -> KvResult<PagedData<VecDeque<GvaTxDbV1>>> {
        self.get_txs_history_bc_received_(from, page_info, script_hash, to)
    }

    fn get_txs_history_bc_sent(
        &self,
        from: Option<u64>,
        page_info: PageInfo<txs_history::TxBcCursor>,
        script_hash: Hash,
        to: Option<u64>,
    ) -> KvResult<PagedData<VecDeque<GvaTxDbV1>>> {
        self.get_txs_history_bc_sent_(from, page_info, script_hash, to)
    }

    fn get_txs_history_mempool<TxsMpDb: 'static + TxsMpV2DbReadable>(
        &self,
        txs_mp_db_ro: &TxsMpDb,
        pubkey: PublicKey,
    ) -> KvResult<(Vec<TransactionDocumentV10>, Vec<TransactionDocumentV10>)> {
        self.get_txs_history_mempool_(txs_mp_db_ro, pubkey)
    }

    fn idty(
        &self,
        bc_db: &BcV2DbRo<FileBackend>,
        pubkey: PublicKey,
    ) -> KvResult<Option<duniter_dbs::IdtyDbV2>> {
        self.idty_(bc_db, pubkey)
    }

    fn peers_and_heads<DB: 'static + DunpV1DbReadable>(
        &self,
        dunp_db: &DB,
    ) -> KvResult<Vec<(duniter_dbs::PeerCardDbV1, Vec<duniter_dbs::DunpHeadDbV1>)>> {
        self.peers_and_heads_(dunp_db)
    }

    fn unspent_uds_of_pubkey(
        &self,
        bc_db: &BcV2DbRo<FileBackend>,
        pubkey: PublicKey,
        page_info: PageInfo<BlockNumber>,
        bn_to_exclude_opt: Option<BTreeSet<BlockNumber>>,
        amount_target_opt: Option<SourceAmount>,
    ) -> KvResult<PagedData<uds_of_pubkey::UdsWithSum>> {
        self.unspent_uds_of_pubkey_(
            bc_db,
            pubkey,
            page_info,
            bn_to_exclude_opt.as_ref(),
            amount_target_opt,
        )
    }
}

#[cfg(test)]
impl DbsReaderImpl {
    pub(crate) fn mem() -> Self {
        use duniter_gva_db::GvaV1DbWritable;
        let gva_db = duniter_gva_db::GvaV1Db::<Mem>::open(MemConf::default())
            .expect("fail to create memory gva db");
        create_dbs_reader(unsafe { std::mem::transmute(&gva_db.get_ro_handler()) })
    }
}

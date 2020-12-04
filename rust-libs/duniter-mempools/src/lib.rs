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

use std::borrow::Cow;

use dubp::common::crypto::keys::ed25519::PublicKey;
use dubp::documents::prelude::*;
use dubp::documents::transaction::TransactionDocumentV10;
use duniter_dbs::kv_typed::prelude::*;
use duniter_dbs::{bc_v2::BcV2DbReadable, TxsMpV2Db, TxsMpV2DbReadable};
use thiserror::Error;

#[derive(Clone, Copy, Debug, Default)]
pub struct Mempools {
    pub txs: TxsMempool,
}

#[derive(Debug, Error)]
pub enum TxMpError {
    #[error("{0}")]
    Db(KvError),
    #[error("Mempool full")]
    Full,
    #[error("Transaction already written in blockchain")]
    TxAlreadyWritten,
}

impl From<KvError> for TxMpError {
    fn from(e: KvError) -> Self {
        TxMpError::Db(e)
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct TxsMempool {
    max_size: usize,
}

impl TxsMempool {
    pub fn new(max_size: usize) -> Self {
        TxsMempool { max_size }
    }
    pub fn accept_new_tx<BcDb: BcV2DbReadable, TxsMpDb: TxsMpV2DbReadable>(
        &self,
        bc_db_ro: &BcDb,
        server_pubkey: PublicKey,
        tx: TransactionDocumentV10,
        txs_mp_db_ro: &TxsMpDb,
    ) -> Result<(), TxMpError> {
        if duniter_dbs_read_ops::tx_exist(bc_db_ro, tx.get_hash())? {
            Err(TxMpError::TxAlreadyWritten)
        } else if tx.issuers().contains(&server_pubkey)
            || txs_mp_db_ro.txs().count()? < self.max_size
        {
            Ok(())
        } else {
            Err(TxMpError::Full)
        }
    }

    pub fn add_pending_tx<B: Backend, BcDb: BcV2DbReadable>(
        &self,
        bc_db_ro: &BcDb,
        server_pubkey: PublicKey,
        txs_mp_db: &TxsMpV2Db<B>,
        tx: &TransactionDocumentV10,
    ) -> Result<(), TxMpError> {
        if duniter_dbs_read_ops::tx_exist(bc_db_ro, tx.get_hash())? {
            Err(TxMpError::TxAlreadyWritten)
        } else if tx.issuers().contains(&server_pubkey) {
            duniter_dbs_write_ops::txs_mp::add_pending_tx(
                |_, _| Ok(()),
                txs_mp_db,
                Cow::Borrowed(tx),
            )?;
            Ok(())
        } else {
            duniter_dbs_write_ops::txs_mp::add_pending_tx(
                |_tx, txs| {
                    if txs.count()? >= self.max_size {
                        Err(KvError::Custom(TxMpError::Full.into()))
                    } else {
                        Ok(())
                    }
                },
                txs_mp_db,
                Cow::Borrowed(tx),
            )?;
            Ok(())
        }
    }

    #[doc(hidden)]
    pub fn add_pending_tx_force<B: Backend>(
        &self,
        txs_mp_db: &TxsMpV2Db<B>,
        tx: &TransactionDocumentV10,
    ) -> KvResult<()> {
        duniter_dbs_write_ops::txs_mp::add_pending_tx(|_, _| Ok(()), txs_mp_db, Cow::Borrowed(tx))?;
        Ok(())
    }

    pub fn get_free_rooms<TxsMpDb: TxsMpV2DbReadable>(
        &self,
        txs_mp_db_ro: &TxsMpDb,
    ) -> KvResult<usize> {
        Ok(self.max_size - txs_mp_db_ro.txs().count()?)
    }
}

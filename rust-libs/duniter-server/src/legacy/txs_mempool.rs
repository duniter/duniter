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

use crate::*;

impl DuniterServer {
    pub fn accept_new_tx(
        &self,
        tx: TransactionDocumentV10,
        server_pubkey: PublicKey,
    ) -> KvResult<bool> {
        let txs_mempool = self.txs_mempool;
        match self
            .dbs_pool
            .execute(move |dbs| {
                txs_mempool.accept_new_tx(&dbs.bc_db_ro, server_pubkey, tx, &dbs.txs_mp_db)
            })
            .expect("dbs pool discorrected")
        {
            Ok(()) => Ok(true),
            Err(TxMpError::Db(e)) => Err(e),
            Err(_) => Ok(false),
        }
    }
    pub fn add_pending_tx_force(&self, tx: TransactionDocumentV10) -> KvResult<()> {
        let txs_mempool = self.txs_mempool;
        self.dbs_pool
            .execute(move |dbs| txs_mempool.add_pending_tx_force(&dbs.txs_mp_db, &tx))
            .expect("dbs pool disconnected")
    }
    pub fn get_mempool_txs_free_rooms(&self) -> KvResult<usize> {
        let txs_mempool = self.txs_mempool;
        self.dbs_pool
            .execute(move |dbs| txs_mempool.get_free_rooms(&dbs.txs_mp_db))
            .expect("dbs pool discorrected")
    }
    pub fn get_new_pending_txs(&self) -> KvResult<Vec<TransactionDocumentV10>> {
        let mut new_pending_txs = BTreeMap::new();
        for events in self.pending_txs_subscriber.drain() {
            use std::ops::Deref as _;
            for event in events.deref() {
                match event {
                    duniter_core::dbs::databases::txs_mp_v2::TxsEvent::Upsert { key, value } => {
                        new_pending_txs.insert(key.0, value.doc.clone());
                    }
                    duniter_core::dbs::databases::txs_mp_v2::TxsEvent::Remove { key } => {
                        new_pending_txs.remove(&key.0);
                    }
                    _ => (),
                }
            }
        }
        Ok(new_pending_txs.into_values().collect())
    }
    pub fn get_pending_txs(
        &self,
        _blockchain_time: i64,
        min_version: usize,
    ) -> KvResult<Vec<PendingTxDbV2>> {
        self.dbs_pool
            .execute(move |dbs| {
                dbs.txs_mp_db.txs().iter(.., |it| {
                    it.values()
                        .filter_ok(|tx| tx.doc.version() >= min_version)
                        .collect()
                })
            })
            .expect("dbs pool disconnected")
    }
    pub fn remove_all_pending_txs(&self) -> KvResult<()> {
        self.dbs_pool
            .execute(move |dbs| {
                duniter_core::dbs_write_ops::txs_mp::remove_all_pending_txs(&dbs.txs_mp_db)
            })
            .expect("dbs pool disconnected")
    }
    pub fn remove_pending_tx_by_hash(&self, hash: Hash) -> KvResult<()> {
        self.dbs_pool
            .execute(move |dbs| {
                duniter_core::dbs_write_ops::txs_mp::remove_pending_tx_by_hash(&dbs.txs_mp_db, hash)
            })
            .expect("dbs pool disconnected")
    }
    pub fn trim_expired_non_written_txs(&self, limit_time: i64) -> KvResult<()> {
        self.dbs_pool
            .execute(move |dbs| {
                duniter_core::dbs_write_ops::txs_mp::trim_expired_non_written_txs(
                    &dbs.txs_mp_db,
                    limit_time,
                )
            })
            .expect("dbs pool disconnected")
    }
}

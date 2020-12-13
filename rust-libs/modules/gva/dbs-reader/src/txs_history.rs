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

impl DbsReader {
    pub fn get_txs_history_bc_received(&self, script_hash: Hash) -> KvResult<Vec<TxDbV2>> {
        let start_k = WalletHashWithBnV1Db::new(script_hash, BlockNumber(0));
        let end_k = WalletHashWithBnV1Db::new(script_hash, BlockNumber(u32::MAX));

        self.0
            .txs_by_recipient()
            .iter_ref_slice(start_k..end_k, |_k, hashs| {
                let mut sent = SmallVec::<[TxDbV2; 8]>::new();
                for hash in hashs {
                    if let Some(tx_db) = self.0.txs().get(HashKeyV2::from_ref(hash))? {
                        sent.push(tx_db);
                    }
                }
                Ok(sent)
            })
            .flatten_ok()
            .collect::<KvResult<Vec<_>>>()
    }
    pub fn get_txs_history_bc_sent(&self, script_hash: Hash) -> KvResult<Vec<TxDbV2>> {
        let start_k = WalletHashWithBnV1Db::new(script_hash, BlockNumber(0));
        let end_k = WalletHashWithBnV1Db::new(script_hash, BlockNumber(u32::MAX));

        self.0
            .txs_by_issuer()
            .iter_ref_slice(start_k..end_k, |_k, hashs| {
                let mut sent = SmallVec::<[TxDbV2; 8]>::new();
                for hash in hashs {
                    if let Some(tx_db) = self.0.txs().get(HashKeyV2::from_ref(hash))? {
                        sent.push(tx_db);
                    }
                }
                Ok(sent)
            })
            .flatten_ok()
            .collect::<KvResult<Vec<_>>>()
    }
    pub fn get_txs_history_mempool<TxsMpDb: TxsMpV2DbReadable>(
        &self,
        txs_mp_db_ro: &TxsMpDb,
        pubkey: PublicKey,
    ) -> KvResult<(Vec<TransactionDocumentV10>, Vec<TransactionDocumentV10>)> {
        let sending = txs_mp_db_ro
            .txs_by_issuer()
            .get_ref_slice(&PubKeyKeyV2(pubkey), |hashs| {
                let mut sent = Vec::with_capacity(hashs.len());
                for hash in hashs {
                    if let Some(tx_db) = txs_mp_db_ro.txs().get(HashKeyV2::from_ref(hash))? {
                        sent.push(tx_db.0);
                    }
                }
                Ok(sent)
            })?
            .unwrap_or_default();
        let pending = txs_mp_db_ro
            .txs_by_recipient()
            .get_ref_slice(&PubKeyKeyV2(pubkey), |hashs| {
                let mut pending = Vec::with_capacity(hashs.len());
                for hash in hashs {
                    if let Some(tx_db) = txs_mp_db_ro.txs().get(HashKeyV2::from_ref(hash))? {
                        pending.push(tx_db.0);
                    }
                }
                Ok(pending)
            })?
            .unwrap_or_default();
        Ok((sending, pending))
    }
}
use duniter_dbs::{smallvec::SmallVec, WalletHashWithBnV1Db};

// Needed for BMA only
pub struct TxsHistory {
    pub sent: Vec<TxDbV2>,
    pub received: Vec<TxDbV2>,
    pub sending: Vec<TransactionDocumentV10>,
    pub pending: Vec<TransactionDocumentV10>,
}

// Needed for BMA only
pub fn get_transactions_history_for_bma<GvaDb: GvaV1DbReadable, TxsMpDb: TxsMpV2DbReadable>(
    gva_db_ro: &GvaDb,
    txs_mp_db_ro: &TxsMpDb,
    pubkey: PublicKey,
) -> KvResult<TxsHistory> {
    let script_hash = Hash::compute(WalletScriptV10::single_sig(pubkey).to_string().as_bytes());
    let start_k = WalletHashWithBnV1Db::new(script_hash, BlockNumber(0));
    let end_k = WalletHashWithBnV1Db::new(script_hash, BlockNumber(u32::MAX));

    let sent = gva_db_ro
        .txs_by_issuer()
        .iter_ref_slice(start_k..end_k, |_k, hashs| {
            let mut sent = SmallVec::<[TxDbV2; 2]>::new();
            for hash in hashs {
                if let Some(tx_db) = gva_db_ro.txs().get(HashKeyV2::from_ref(hash))? {
                    sent.push(tx_db);
                }
            }
            Ok(sent)
        })
        .flatten_ok()
        .collect::<KvResult<Vec<_>>>()?;

    let received = gva_db_ro
        .txs_by_recipient()
        .iter_ref_slice(start_k..end_k, |_k, hashs| {
            let mut sent = SmallVec::<[TxDbV2; 2]>::new();
            for hash in hashs {
                if let Some(tx_db) = gva_db_ro.txs().get(HashKeyV2::from_ref(hash))? {
                    sent.push(tx_db);
                }
            }
            Ok(sent)
        })
        .flatten_ok()
        .collect::<KvResult<Vec<_>>>()?;
    let sending = txs_mp_db_ro
        .txs_by_issuer()
        .get_ref_slice(&PubKeyKeyV2(pubkey), |hashs| {
            let mut sent = Vec::with_capacity(hashs.len());
            for hash in hashs {
                if let Some(tx_db) = txs_mp_db_ro.txs().get(HashKeyV2::from_ref(hash))? {
                    sent.push(tx_db.0);
                }
            }
            Ok(sent)
        })?
        .unwrap_or_default();
    let pending = txs_mp_db_ro
        .txs_by_recipient()
        .get_ref_slice(&PubKeyKeyV2(pubkey), |hashs| {
            let mut pending = Vec::with_capacity(hashs.len());
            for hash in hashs {
                if let Some(tx_db) = txs_mp_db_ro.txs().get(HashKeyV2::from_ref(hash))? {
                    pending.push(tx_db.0);
                }
            }
            Ok(pending)
        })?
        .unwrap_or_default();
    Ok(TxsHistory {
        sent,
        received,
        sending,
        pending,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use dubp::crypto::keys::ed25519::PublicKey;
    use duniter_dbs::databases::gva_v1::GvaV1DbWritable;
    use maplit::btreeset;

    #[test]
    fn test_get_txs_history_bc() -> KvResult<()> {
        let gva_db = duniter_dbs::databases::gva_v1::GvaV1Db::<Mem>::open(MemConf::default())?;
        let db_reader = create_dbs_reader(unsafe { std::mem::transmute(&gva_db.get_ro_handler()) });

        let s1 = WalletScriptV10::single_sig(PublicKey::default());
        let s1_hash = Hash::compute_str(&s1.to_string());

        gva_db
            .txs_write()
            .upsert(HashKeyV2(Hash::default()), TxDbV2::default())?;
        gva_db.txs_by_issuer_write().upsert(
            WalletHashWithBnV1Db::new(s1_hash, BlockNumber(0)),
            btreeset![Hash::default()],
        )?;

        let _received = db_reader.get_txs_history_bc_received(s1_hash)?;
        let sent = db_reader.get_txs_history_bc_sent(s1_hash)?;

        assert_eq!(sent, vec![TxDbV2::default()]);

        Ok(())
    }
}

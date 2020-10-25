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

pub struct TxsHistory {
    pub sent: Vec<TxDbV2>,
    pub received: Vec<TxDbV2>,
    pub sending: Vec<TransactionDocumentV10>,
    pub pending: Vec<TransactionDocumentV10>,
}

pub fn tx_exist<GvaDb: GvaV1DbReadable>(gva_db_ro: &GvaDb, hash: Hash) -> KvResult<bool> {
    Ok(gva_db_ro.txs().get(&HashKeyV2(hash))?.is_some())
}

pub fn get_transactions_history<GvaDb: GvaV1DbReadable, TxsMpDb: TxsMpV2DbReadable>(
    gva_db_ro: &GvaDb,
    txs_mp_db_ro: &TxsMpDb,
    pubkey: PublicKey,
) -> KvResult<TxsHistory> {
    let sent = gva_db_ro
        .txs_by_issuer()
        .get_ref_slice(&PubKeyKeyV2(pubkey), |hashs| {
            let mut sent = Vec::with_capacity(hashs.len());
            for hash in hashs {
                if let Some(tx_db) = gva_db_ro.txs().get(HashKeyV2::from_ref(hash))? {
                    sent.push(tx_db);
                }
            }
            Ok(sent)
        })?
        .unwrap_or_default();
    let received = gva_db_ro
        .txs_by_recipient()
        .get_ref_slice(&PubKeyKeyV2(pubkey), |hashs| {
            let mut received = Vec::with_capacity(hashs.len());
            for hash in hashs {
                if let Some(tx_db) = gva_db_ro.txs().get(HashKeyV2::from_ref(hash))? {
                    received.push(tx_db);
                }
            }
            Ok(received)
        })?
        .unwrap_or_default();
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

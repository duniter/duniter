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
use duniter_dbs::smallvec::SmallVec;
use duniter_gva_db::WalletHashWithBnV1Db;

#[derive(Clone, Copy, Debug, Default, Eq, Ord, PartialEq, PartialOrd)]
pub struct TxBcCursor {
    pub block_number: BlockNumber,
    pub tx_hash: Hash,
}
impl std::fmt::Display for TxBcCursor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}:{}", self.block_number, self.tx_hash,)
    }
}

impl FromStr for TxBcCursor {
    type Err = WrongCursor;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let mut s = s.split(':');
        let block_number = s
            .next()
            .ok_or(WrongCursor)?
            .parse()
            .map_err(|_| WrongCursor)?;
        let tx_hash = Hash::from_hex(s.next().ok_or(WrongCursor)?).map_err(|_| WrongCursor)?;
        Ok(Self {
            block_number,
            tx_hash,
        })
    }
}

impl DbsReader {
    pub fn get_txs_history_bc_received(
        &self,
        from: Option<u64>,
        page_info: PageInfo<TxBcCursor>,
        script_hash: Hash,
        to: Option<u64>,
    ) -> KvResult<PagedData<VecDeque<GvaTxDbV1>>> {
        let mut start_k = WalletHashWithBnV1Db::new(
            script_hash,
            BlockNumber(if let Some(from) = from {
                self.0
                    .blocks_by_common_time()
                    .iter(U64BE(from).., |it| it)
                    .values()
                    .next_res()?
                    .unwrap_or(u32::MAX)
            } else {
                0
            }),
        );
        let mut end_k = WalletHashWithBnV1Db::new(
            script_hash,
            BlockNumber(if let Some(to) = to {
                self.0
                    .blocks_by_common_time()
                    .iter_rev(..U64BE(to), |it| it)
                    .values()
                    .next_res()?
                    .unwrap_or(0)
            } else {
                u32::MAX
            }),
        );
        let first_cursor_opt = if page_info.not_all() {
            self.0
                .txs_by_recipient()
                .iter_ref_slice(start_k..=end_k, |k, hashs| {
                    Ok(TxBcCursor {
                        block_number: BlockNumber(k.get_block_number()),
                        tx_hash: hashs[0],
                    })
                })
                .next_res()?
        } else {
            None
        };
        let last_cursor_opt = if page_info.not_all() {
            self.0
                .txs_by_recipient()
                .iter_ref_slice_rev(start_k..=end_k, |k, hashs| {
                    Ok(TxBcCursor {
                        block_number: BlockNumber(k.get_block_number()),
                        tx_hash: hashs[hashs.len() - 1],
                    })
                })
                .next_res()?
        } else {
            None
        };
        let first_hashs_opt = if let Some(TxBcCursor {
            block_number,
            tx_hash: hash_limit,
        }) = page_info.pos
        {
            if page_info.order {
                let hashs = self.0.txs_by_recipient().get_ref_slice(
                    &WalletHashWithBnV1Db::new(script_hash, block_number),
                    |hashs| {
                        Ok(hashs
                            .iter()
                            .rev()
                            .take_while(|hash| *hash != &hash_limit)
                            .copied()
                            .collect::<SmallVec<[Hash; 8]>>())
                    },
                )?;
                start_k = WalletHashWithBnV1Db::new(script_hash, BlockNumber(block_number.0 + 1));
                hashs
            } else {
                let hashs = self.0.txs_by_recipient().get_ref_slice(
                    &WalletHashWithBnV1Db::new(script_hash, block_number),
                    |hashs| {
                        Ok(hashs
                            .iter()
                            .take_while(|hash| *hash != &hash_limit)
                            .copied()
                            .collect::<SmallVec<[Hash; 8]>>())
                    },
                )?;
                if block_number == BlockNumber(0) {
                    return Ok(PagedData::empty());
                }
                end_k = WalletHashWithBnV1Db::new(script_hash, BlockNumber(block_number.0 - 1));
                hashs
            }
        } else {
            None
        };

        if page_info.order {
            let txs_iter = self
                .0
                .txs_by_recipient()
                .iter_ref_slice(start_k..=end_k, |_k, hashs| {
                    let mut sent = SmallVec::<[GvaTxDbV1; 8]>::new();
                    for hash in hashs {
                        if let Some(tx_db) = self.0.txs().get(HashKeyV2::from_ref(hash))? {
                            sent.push(tx_db);
                        }
                    }
                    Ok(sent)
                })
                .flatten_ok();
            txs_history_bc_collect(
                *self,
                first_cursor_opt,
                first_hashs_opt,
                last_cursor_opt,
                page_info,
                txs_iter,
            )
        } else {
            let txs_iter = self
                .0
                .txs_by_recipient()
                .iter_ref_slice_rev(start_k..=end_k, |_k, hashs| {
                    let mut sent = SmallVec::<[GvaTxDbV1; 8]>::new();
                    for hash in hashs.iter().rev() {
                        if let Some(tx_db) = self.0.txs().get(HashKeyV2::from_ref(hash))? {
                            sent.push(tx_db);
                        }
                    }
                    Ok(sent)
                })
                .flatten_ok();
            txs_history_bc_collect(
                *self,
                first_cursor_opt,
                first_hashs_opt,
                last_cursor_opt,
                page_info,
                txs_iter,
            )
        }
    }
    pub fn get_txs_history_bc_sent(
        &self,
        from: Option<u64>,
        page_info: PageInfo<TxBcCursor>,
        script_hash: Hash,
        to: Option<u64>,
    ) -> KvResult<PagedData<VecDeque<GvaTxDbV1>>> {
        let mut start_k = WalletHashWithBnV1Db::new(
            script_hash,
            BlockNumber(if let Some(from) = from {
                self.0
                    .blocks_by_common_time()
                    .iter(U64BE(from).., |it| it)
                    .values()
                    .next_res()?
                    .unwrap_or(u32::MAX)
            } else {
                0
            }),
        );
        let mut end_k = WalletHashWithBnV1Db::new(
            script_hash,
            BlockNumber(if let Some(to) = to {
                self.0
                    .blocks_by_common_time()
                    .iter_rev(..U64BE(to), |it| it)
                    .values()
                    .next_res()?
                    .unwrap_or(0)
            } else {
                u32::MAX
            }),
        );
        let first_cursor_opt = if page_info.not_all() {
            self.0
                .txs_by_issuer()
                .iter_ref_slice(start_k..=end_k, |k, hashs| {
                    Ok(TxBcCursor {
                        block_number: BlockNumber(k.get_block_number()),
                        tx_hash: hashs[0],
                    })
                })
                .next_res()?
        } else {
            None
        };
        let last_cursor_opt = if page_info.not_all() {
            self.0
                .txs_by_issuer()
                .iter_ref_slice_rev(start_k..=end_k, |k, hashs| {
                    Ok(TxBcCursor {
                        block_number: BlockNumber(k.get_block_number()),
                        tx_hash: hashs[hashs.len() - 1],
                    })
                })
                .next_res()?
        } else {
            None
        };
        let first_hashs_opt = if let Some(TxBcCursor {
            block_number,
            tx_hash: hash_limit,
        }) = page_info.pos
        {
            if page_info.order {
                let hashs = self.0.txs_by_issuer().get_ref_slice(
                    &WalletHashWithBnV1Db::new(script_hash, block_number),
                    |hashs| {
                        Ok(hashs
                            .iter()
                            .rev()
                            .take_while(|hash| *hash != &hash_limit)
                            .copied()
                            .collect::<SmallVec<[Hash; 8]>>())
                    },
                )?;
                start_k = WalletHashWithBnV1Db::new(script_hash, BlockNumber(block_number.0 + 1));
                hashs
            } else {
                let hashs = self.0.txs_by_issuer().get_ref_slice(
                    &WalletHashWithBnV1Db::new(script_hash, block_number),
                    |hashs| {
                        Ok(hashs
                            .iter()
                            .take_while(|hash| *hash != &hash_limit)
                            .copied()
                            .collect::<SmallVec<[Hash; 8]>>())
                    },
                )?;
                if block_number == BlockNumber(0) {
                    return Ok(PagedData::empty());
                }
                end_k = WalletHashWithBnV1Db::new(script_hash, BlockNumber(block_number.0 - 1));
                hashs
            }
        } else {
            None
        };

        if page_info.order {
            let txs_iter = self
                .0
                .txs_by_issuer()
                .iter_ref_slice(start_k..=end_k, |_k, hashs| {
                    let mut sent = SmallVec::<[GvaTxDbV1; 8]>::new();
                    for hash in hashs {
                        if let Some(tx_db) = self.0.txs().get(HashKeyV2::from_ref(hash))? {
                            sent.push(tx_db);
                        }
                    }
                    Ok(sent)
                })
                .flatten_ok();
            txs_history_bc_collect(
                *self,
                first_cursor_opt,
                first_hashs_opt,
                last_cursor_opt,
                page_info,
                txs_iter,
            )
        } else {
            let txs_iter = self
                .0
                .txs_by_issuer()
                .iter_ref_slice_rev(start_k..=end_k, |_k, hashs| {
                    let mut sent = SmallVec::<[GvaTxDbV1; 8]>::new();
                    for hash in hashs.iter().rev() {
                        if let Some(tx_db) = self.0.txs().get(HashKeyV2::from_ref(hash))? {
                            sent.push(tx_db);
                        }
                    }
                    Ok(sent)
                })
                .flatten_ok();
            txs_history_bc_collect(
                *self,
                first_cursor_opt,
                first_hashs_opt,
                last_cursor_opt,
                page_info,
                txs_iter,
            )
        }
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

fn txs_history_bc_collect<I: Iterator<Item = KvResult<GvaTxDbV1>>>(
    dbs_reader: DbsReader,
    first_cursor_opt: Option<TxBcCursor>,
    first_hashs_opt: Option<SmallVec<[Hash; 8]>>,
    last_cursor_opt: Option<TxBcCursor>,
    page_info: PageInfo<TxBcCursor>,
    txs_iter: I,
) -> KvResult<PagedData<VecDeque<GvaTxDbV1>>> {
    let mut txs = if let Some(limit) = page_info.limit_opt {
        txs_iter
            .take(limit.get())
            .collect::<KvResult<VecDeque<_>>>()?
    } else {
        txs_iter.collect::<KvResult<VecDeque<_>>>()?
    };

    if let Some(first_hashs) = first_hashs_opt {
        for hash in first_hashs.into_iter() {
            if let Some(tx_db) = dbs_reader.0.txs().get(&HashKeyV2(hash))? {
                txs.push_front(tx_db);
            }
        }
    }

    Ok(PagedData {
        has_next_page: if page_info.order {
            has_next_page(
                txs.iter().map(|tx_db| {
                    TxBcCursor {
                        block_number: tx_db.written_block.number,
                        tx_hash: tx_db.tx.get_hash(),
                    }
                    .into()
                }),
                last_cursor_opt,
                page_info,
                page_info.order,
            )
        } else {
            // Server can't efficiently determine hasNextPage in DESC order
            false
        },
        has_previous_page: if page_info.order {
            // Server can't efficiently determine hasPreviousPage in ASC order
            false
        } else {
            has_previous_page(
                txs.iter().map(|tx_db| {
                    TxBcCursor {
                        block_number: tx_db.written_block.number,
                        tx_hash: tx_db.tx.get_hash(),
                    }
                    .into()
                }),
                first_cursor_opt,
                page_info,
                page_info.order,
            )
        },
        data: txs,
    })
}

// Needed for BMA only
pub struct TxsHistory {
    pub sent: Vec<GvaTxDbV1>,
    pub received: Vec<GvaTxDbV1>,
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
            let mut sent = SmallVec::<[GvaTxDbV1; 2]>::new();
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
            let mut sent = SmallVec::<[GvaTxDbV1; 2]>::new();
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
    use dubp::{
        common::prelude::{BlockHash, Blockstamp},
        crypto::keys::ed25519::PublicKey,
        documents::transaction::{TransactionDocumentV10, TransactionDocumentV10Stringified},
        documents_parser::prelude::FromStringObject,
    };
    use duniter_gva_db::GvaV1DbWritable;
    use maplit::btreeset;
    use unwrap::unwrap;

    fn gen_tx(hash: Hash, written_block_number: BlockNumber) -> GvaTxDbV1 {
        GvaTxDbV1 {
            tx: unwrap!(TransactionDocumentV10::from_string_object(
                &TransactionDocumentV10Stringified {
                    currency: "test".to_owned(),
                    blockstamp:
                        "1-0000000000000000000000000000000000000000000000000000000000000000"
                            .to_owned(),
                    locktime: 0,
                    issuers: vec![],
                    inputs: vec![],
                    unlocks: vec![],
                    outputs: vec![],
                    comment: "".to_owned(),
                    signatures: vec![],
                    hash: Some(hash.to_hex()),
                }
            )),
            written_block: Blockstamp {
                number: written_block_number,
                hash: BlockHash(Hash::default()),
            },
            written_time: 1,
        }
    }

    #[test]
    fn test_get_txs_history_bc_received() -> KvResult<()> {
        let gva_db = duniter_gva_db::GvaV1Db::<Mem>::open(MemConf::default())?;
        let db_reader = create_dbs_reader(unsafe { std::mem::transmute(&gva_db.get_ro_handler()) });

        let s1 = WalletScriptV10::single_sig(PublicKey::default());
        let s1_hash = Hash::compute(&s1.to_string().as_bytes());

        gva_db.txs_write().upsert(
            HashKeyV2(Hash::default()),
            gen_tx(Hash::default(), BlockNumber(1)),
        )?;
        gva_db.txs_write().upsert(
            HashKeyV2(Hash([1; 32])),
            gen_tx(Hash([1; 32]), BlockNumber(1)),
        )?;
        gva_db.txs_write().upsert(
            HashKeyV2(Hash([2; 32])),
            gen_tx(Hash([2; 32]), BlockNumber(1)),
        )?;
        gva_db.txs_write().upsert(
            HashKeyV2(Hash([3; 32])),
            gen_tx(Hash([3; 32]), BlockNumber(1)),
        )?;
        gva_db.txs_by_recipient_write().upsert(
            WalletHashWithBnV1Db::new(s1_hash, BlockNumber(1)),
            btreeset![Hash::default(), Hash([1; 32]), Hash([2; 32]), Hash([3; 32])],
        )?;
        gva_db.blocks_by_common_time_write().upsert(U64BE(1), 1)?;
        gva_db.txs_write().upsert(
            HashKeyV2(Hash([4; 32])),
            gen_tx(Hash([4; 32]), BlockNumber(2)),
        )?;
        gva_db.txs_write().upsert(
            HashKeyV2(Hash([5; 32])),
            gen_tx(Hash([5; 32]), BlockNumber(2)),
        )?;
        gva_db.txs_by_recipient_write().upsert(
            WalletHashWithBnV1Db::new(s1_hash, BlockNumber(2)),
            btreeset![Hash([4; 32]), Hash([5; 32])],
        )?;
        gva_db.blocks_by_common_time_write().upsert(U64BE(2), 2)?;
        gva_db.txs_write().upsert(
            HashKeyV2(Hash([6; 32])),
            gen_tx(Hash([6; 32]), BlockNumber(3)),
        )?;
        gva_db.txs_by_recipient_write().upsert(
            WalletHashWithBnV1Db::new(s1_hash, BlockNumber(3)),
            btreeset![Hash([6; 32])],
        )?;
        gva_db.blocks_by_common_time_write().upsert(U64BE(3), 3)?;
        gva_db.txs_write().upsert(
            HashKeyV2(Hash([7; 32])),
            gen_tx(Hash([7; 32]), BlockNumber(4)),
        )?;
        gva_db.txs_by_recipient_write().upsert(
            WalletHashWithBnV1Db::new(s1_hash, BlockNumber(4)),
            btreeset![Hash([7; 32])],
        )?;
        gva_db.blocks_by_common_time_write().upsert(U64BE(4), 4)?;
        gva_db.txs_write().upsert(
            HashKeyV2(Hash([8; 32])),
            gen_tx(Hash([8; 32]), BlockNumber(5)),
        )?;
        gva_db.txs_by_recipient_write().upsert(
            WalletHashWithBnV1Db::new(s1_hash, BlockNumber(5)),
            btreeset![Hash([8; 32])],
        )?;
        gva_db.blocks_by_common_time_write().upsert(U64BE(5), 5)?;

        /*let received = db_reader.get_txs_history_bc_received(
            PageInfo {
                order: true,
                limit_opt: None,
                pos: Some(TxBcCursor {
                    tx_hash: Hash([1; 32]),
                    block_number: BlockNumber(1),
                }),
            },
            s1_hash,
        )?;
        assert_eq!(
            received.data
                .into_iter()
                .map(|tx_db| tx_db.tx.get_hash())
                .collect::<Vec<_>>(),
            vec![Hash([2; 32]), Hash([3; 32]), Hash([4; 32]), Hash([5; 32])],
        );
        assert!(!received.has_next_page);
        assert!(!received.has_previous_page);

        let received = db_reader.get_txs_history_bc_received(
            PageInfo {
                order: false,
                limit_opt: None,
                pos: Some(TxBcCursor {
                    tx_hash: Hash([1; 32]),
                    block_number: BlockNumber(1),
                }),
            },
            s1_hash,
        )?;
        assert_eq!(
            received.data
                .into_iter()
                .map(|tx_db| tx_db.tx.get_hash())
                .collect::<Vec<_>>(),
            vec![Hash([0; 32])],
        );
        assert!(!received.has_next_page);
        assert!(!received.has_previous_page);*/

        let received = db_reader.get_txs_history_bc_received(
            None,
            PageInfo {
                order: false,
                limit_opt: None,
                pos: Some(TxBcCursor {
                    tx_hash: Hash([5; 32]),
                    block_number: BlockNumber(2),
                }),
            },
            s1_hash,
            None,
        )?;
        assert_eq!(
            received
                .data
                .into_iter()
                .map(|tx_db| tx_db.tx.get_hash())
                .collect::<Vec<_>>(),
            vec![
                Hash([4; 32]),
                Hash([3; 32]),
                Hash([2; 32]),
                Hash([1; 32]),
                Hash([0; 32]),
            ],
        );
        assert!(!received.has_next_page);
        assert!(!received.has_previous_page);

        let received = db_reader.get_txs_history_bc_received(
            Some(2),
            PageInfo {
                order: true,
                limit_opt: None,
                pos: None,
            },
            s1_hash,
            Some(5),
        )?;
        assert_eq!(
            received
                .data
                .into_iter()
                .map(|tx_db| tx_db.tx.get_hash())
                .collect::<Vec<_>>(),
            vec![Hash([4; 32]), Hash([5; 32]), Hash([6; 32]), Hash([7; 32])],
        );
        assert!(!received.has_next_page);
        assert!(!received.has_previous_page);

        Ok(())
    }

    #[test]
    fn test_get_txs_history_bc_sent() -> KvResult<()> {
        let gva_db = duniter_gva_db::GvaV1Db::<Mem>::open(MemConf::default())?;
        let db_reader = create_dbs_reader(unsafe { std::mem::transmute(&gva_db.get_ro_handler()) });

        let s1 = WalletScriptV10::single_sig(PublicKey::default());
        let s1_hash = Hash::compute(&s1.to_string().as_bytes());

        gva_db.txs_write().upsert(
            HashKeyV2(Hash::default()),
            gen_tx(Hash::default(), BlockNumber(1)),
        )?;
        gva_db.txs_write().upsert(
            HashKeyV2(Hash([1; 32])),
            gen_tx(Hash([1; 32]), BlockNumber(1)),
        )?;
        gva_db.txs_write().upsert(
            HashKeyV2(Hash([2; 32])),
            gen_tx(Hash([2; 32]), BlockNumber(1)),
        )?;
        gva_db.txs_write().upsert(
            HashKeyV2(Hash([3; 32])),
            gen_tx(Hash([3; 32]), BlockNumber(1)),
        )?;
        gva_db.txs_by_issuer_write().upsert(
            WalletHashWithBnV1Db::new(s1_hash, BlockNumber(1)),
            btreeset![Hash::default(), Hash([1; 32]), Hash([2; 32]), Hash([3; 32])],
        )?;
        gva_db.txs_write().upsert(
            HashKeyV2(Hash([4; 32])),
            gen_tx(Hash([4; 32]), BlockNumber(2)),
        )?;
        gva_db.txs_write().upsert(
            HashKeyV2(Hash([5; 32])),
            gen_tx(Hash([5; 32]), BlockNumber(2)),
        )?;
        gva_db.txs_by_issuer_write().upsert(
            WalletHashWithBnV1Db::new(s1_hash, BlockNumber(2)),
            btreeset![Hash([4; 32]), Hash([5; 32])],
        )?;

        let sent = db_reader.get_txs_history_bc_sent(
            None,
            PageInfo {
                order: true,
                limit_opt: None,
                pos: Some(TxBcCursor {
                    tx_hash: Hash([1; 32]),
                    block_number: BlockNumber(1),
                }),
            },
            s1_hash,
            None,
        )?;
        assert_eq!(
            sent.data
                .into_iter()
                .map(|tx_db| tx_db.tx.get_hash())
                .collect::<Vec<_>>(),
            vec![Hash([2; 32]), Hash([3; 32]), Hash([4; 32]), Hash([5; 32])],
        );
        assert!(!sent.has_next_page);
        assert!(!sent.has_previous_page);

        let sent = db_reader.get_txs_history_bc_sent(
            None,
            PageInfo {
                order: false,
                limit_opt: None,
                pos: Some(TxBcCursor {
                    tx_hash: Hash([1; 32]),
                    block_number: BlockNumber(1),
                }),
            },
            s1_hash,
            None,
        )?;
        assert_eq!(
            sent.data
                .into_iter()
                .map(|tx_db| tx_db.tx.get_hash())
                .collect::<Vec<_>>(),
            vec![Hash([0; 32])],
        );
        assert!(!sent.has_next_page);
        assert!(!sent.has_previous_page);

        let sent = db_reader.get_txs_history_bc_sent(
            None,
            PageInfo {
                order: false,
                limit_opt: None,
                pos: Some(TxBcCursor {
                    tx_hash: Hash([5; 32]),
                    block_number: BlockNumber(2),
                }),
            },
            s1_hash,
            None,
        )?;
        assert_eq!(
            sent.data
                .into_iter()
                .map(|tx_db| tx_db.tx.get_hash())
                .collect::<Vec<_>>(),
            vec![
                Hash([4; 32]),
                Hash([3; 32]),
                Hash([2; 32]),
                Hash([1; 32]),
                Hash([0; 32]),
            ],
        );
        assert!(!sent.has_next_page);
        assert!(!sent.has_previous_page);

        Ok(())
    }
}

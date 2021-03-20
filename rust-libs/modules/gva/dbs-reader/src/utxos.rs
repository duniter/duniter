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

use dubp::documents::dubp_wallet::prelude::*;
use duniter_dbs::SourceAmountValV2;

use crate::*;

pub const MAX_FIRST_UTXOS: usize = 40;

#[derive(Clone, Copy, Debug, Default, Eq, Ord, PartialEq, PartialOrd)]
pub struct UtxoCursor {
    pub block_number: BlockNumber,
    pub tx_hash: Hash,
    pub output_index: u8,
}
impl std::fmt::Display for UtxoCursor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}:{}:{}",
            self.block_number, self.tx_hash, self.output_index,
        )
    }
}

impl FromStr for UtxoCursor {
    type Err = WrongCursor;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let mut s = s.split(':');
        let block_number = s
            .next()
            .ok_or(WrongCursor)?
            .parse()
            .map_err(|_| WrongCursor)?;
        let tx_hash = Hash::from_hex(s.next().ok_or(WrongCursor)?).map_err(|_| WrongCursor)?;
        let output_index = s
            .next()
            .ok_or(WrongCursor)?
            .parse()
            .map_err(|_| WrongCursor)?;
        Ok(Self {
            block_number,
            tx_hash,
            output_index,
        })
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Utxo {
    pub amount: SourceAmount,
    pub tx_hash: Hash,
    pub output_index: u8,
}

#[derive(Debug, Default)]
pub struct UtxosWithSum {
    pub utxos: Vec<(UtxoCursor, SourceAmount)>,
    pub sum: SourceAmount,
}

impl DbsReaderImpl {
    pub(super) fn find_script_utxos_<TxsMpDb: 'static + TxsMpV2DbReadable>(
        &self,
        txs_mp_db_ro: &TxsMpDb,
        amount_target_opt: Option<SourceAmount>,
        page_info: PageInfo<UtxoCursor>,
        script: &WalletScriptV10,
    ) -> anyhow::Result<PagedData<UtxosWithSum>> {
        let mempool_filter = |k_res: KvResult<GvaUtxoIdDbV1>| match k_res {
            Ok(gva_utxo_id) => {
                match txs_mp_db_ro.utxos_ids().contains_key(&UtxoIdDbV2(
                    gva_utxo_id.get_tx_hash(),
                    gva_utxo_id.get_output_index() as u32,
                )) {
                    Ok(false) => Some(Ok(gva_utxo_id)),
                    Ok(true) => None,
                    Err(e) => Some(Err(e)),
                }
            }
            Err(e) => Some(Err(e)),
        };

        let script_hash = Hash::compute(script.to_string().as_bytes());
        let (mut k_min, mut k_max) = GvaUtxoIdDbV1::script_interval(script_hash);
        let first_cursor_opt = if page_info.not_all() {
            self.0
                .gva_utxos()
                .iter(k_min..k_max, |it| {
                    it.keys().filter_map(mempool_filter).next_res()
                })?
                .map(|gva_utxo_id| UtxoCursor {
                    block_number: BlockNumber(gva_utxo_id.get_block_number()),
                    tx_hash: gva_utxo_id.get_tx_hash(),
                    output_index: gva_utxo_id.get_output_index(),
                })
        } else {
            None
        };
        let last_cursor_opt = if page_info.not_all() {
            self.0
                .gva_utxos()
                .iter_rev(k_min..k_max, |it| {
                    it.keys().filter_map(mempool_filter).next_res()
                })?
                .map(|gva_utxo_id| UtxoCursor {
                    block_number: BlockNumber(gva_utxo_id.get_block_number()),
                    tx_hash: gva_utxo_id.get_tx_hash(),
                    output_index: gva_utxo_id.get_output_index(),
                })
        } else {
            None
        };
        if let Some(ref pos) = page_info.pos {
            if page_info.order {
                k_min = GvaUtxoIdDbV1::new_(
                    script_hash,
                    pos.block_number.0,
                    pos.tx_hash,
                    pos.output_index,
                );
            } else {
                k_max = GvaUtxoIdDbV1::new_(
                    script_hash,
                    pos.block_number.0,
                    pos.tx_hash,
                    pos.output_index,
                );
            }
        }
        let UtxosWithSum { utxos, mut sum } = if page_info.order {
            self.0.gva_utxos().iter(k_min..k_max, |it| {
                find_script_utxos_inner(txs_mp_db_ro, amount_target_opt, page_info, it)
            })?
        } else {
            self.0.gva_utxos().iter_rev(k_min..k_max, |it| {
                find_script_utxos_inner(txs_mp_db_ro, amount_target_opt, page_info, it)
            })?
        };

        if amount_target_opt.is_none() {
            sum = utxos.iter().map(|(_utxo_id_with_bn, sa)| *sa).sum();
        }

        let order = page_info.order;

        Ok(PagedData {
            has_next_page: has_next_page(
                utxos
                    .iter()
                    .map(|(utxo_id_with_bn, _sa)| utxo_id_with_bn.into()),
                last_cursor_opt,
                page_info,
                order,
            ),
            has_previous_page: has_previous_page(
                utxos
                    .iter()
                    .map(|(utxo_id_with_bn, _sa)| utxo_id_with_bn.into()),
                first_cursor_opt,
                page_info,
                order,
            ),
            data: UtxosWithSum { utxos, sum },
        })
    }
    pub(super) fn first_scripts_utxos_(
        &self,
        first: usize,
        scripts: &[WalletScriptV10],
    ) -> anyhow::Result<Vec<ArrayVec<[Utxo; MAX_FIRST_UTXOS]>>> {
        Ok(scripts
            .iter()
            .map(|script| {
                let (k_min, k_max) =
                    GvaUtxoIdDbV1::script_interval(Hash::compute(script.to_string().as_bytes()));
                self.0.gva_utxos().iter(k_min..k_max, |it| {
                    it.take(first)
                        .map_ok(|(k, v)| Utxo {
                            amount: v.0,
                            tx_hash: k.get_tx_hash(),
                            output_index: k.get_output_index(),
                        })
                        .collect::<KvResult<_>>()
                })
            })
            .collect::<KvResult<Vec<_>>>()?)
    }
}

fn find_script_utxos_inner<TxsMpDb, I>(
    txs_mp_db_ro: &TxsMpDb,
    amount_target_opt: Option<SourceAmount>,
    page_info: PageInfo<UtxoCursor>,
    utxos_iter: I,
) -> KvResult<UtxosWithSum>
where
    TxsMpDb: TxsMpV2DbReadable,
    I: Iterator<Item = KvResult<(GvaUtxoIdDbV1, SourceAmountValV2)>>,
{
    let mut sum = SourceAmount::ZERO;

    let it = utxos_iter.filter_map(|entry_res| match entry_res {
        Ok((gva_utxo_id, SourceAmountValV2(utxo_amount))) => {
            if utxo_amount.amount() < super::find_inputs::MIN_AMOUNT {
                None
            } else {
                let tx_hash = gva_utxo_id.get_tx_hash();
                let output_index = gva_utxo_id.get_output_index();
                match txs_mp_db_ro
                    .utxos_ids()
                    .contains_key(&UtxoIdDbV2(tx_hash, output_index as u32))
                {
                    Ok(false) => Some(Ok((
                        UtxoCursor {
                            tx_hash,
                            output_index,
                            block_number: BlockNumber(gva_utxo_id.get_block_number()),
                        },
                        utxo_amount,
                    ))),
                    Ok(true) => None,
                    Err(e) => Some(Err(e)),
                }
            }
        }
        Err(e) => Some(Err(e)),
    });
    let utxos = if let Some(limit) = page_info.limit_opt {
        if let Some(total_target) = amount_target_opt {
            it.take(limit.get())
                .take_while(|res| match res {
                    Ok((_, utxo_amount)) => {
                        if sum < total_target {
                            sum = sum + *utxo_amount;
                            true
                        } else {
                            false
                        }
                    }
                    Err(_) => true,
                })
                .collect::<KvResult<Vec<_>>>()?
        } else {
            it.take(limit.get()).collect::<KvResult<Vec<_>>>()?
        }
    } else if let Some(total_target) = amount_target_opt {
        it.take_while(|res| match res {
            Ok((_, utxo_amount)) => {
                if sum < total_target {
                    sum = sum + *utxo_amount;
                    true
                } else {
                    false
                }
            }
            Err(_) => true,
        })
        .collect::<KvResult<Vec<_>>>()?
    } else {
        it.collect::<KvResult<Vec<_>>>()?
    };

    Ok(UtxosWithSum { utxos, sum })
}

#[cfg(test)]
mod tests {

    use super::*;
    use dubp::crypto::keys::PublicKey as _;
    use duniter_dbs::databases::txs_mp_v2::TxsMpV2DbWritable;
    use duniter_gva_db::GvaV1DbWritable;
    use unwrap::unwrap;

    #[test]
    fn test_first_scripts_utxos() -> anyhow::Result<()> {
        let script = WalletScriptV10::single_sig(PublicKey::default());
        let script2 = WalletScriptV10::single_sig(unwrap!(PublicKey::from_base58(
            "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        )));

        let gva_db = duniter_gva_db::GvaV1Db::<Mem>::open(MemConf::default())?;
        let db_reader = create_dbs_reader(unsafe { std::mem::transmute(&gva_db.get_ro_handler()) });

        gva_db.gva_utxos_write().upsert(
            GvaUtxoIdDbV1::new(script.clone(), 0, Hash::default(), 0),
            SourceAmountValV2(SourceAmount::with_base0(500)),
        )?;
        gva_db.gva_utxos_write().upsert(
            GvaUtxoIdDbV1::new(script.clone(), 1, Hash::default(), 1),
            SourceAmountValV2(SourceAmount::with_base0(800)),
        )?;
        gva_db.gva_utxos_write().upsert(
            GvaUtxoIdDbV1::new(script.clone(), 2, Hash::default(), 2),
            SourceAmountValV2(SourceAmount::with_base0(1_200)),
        )?;

        gva_db.gva_utxos_write().upsert(
            GvaUtxoIdDbV1::new(script2.clone(), 0, Hash::default(), 0),
            SourceAmountValV2(SourceAmount::with_base0(400)),
        )?;
        gva_db.gva_utxos_write().upsert(
            GvaUtxoIdDbV1::new(script2.clone(), 1, Hash::default(), 1),
            SourceAmountValV2(SourceAmount::with_base0(700)),
        )?;
        gva_db.gva_utxos_write().upsert(
            GvaUtxoIdDbV1::new(script2.clone(), 2, Hash::default(), 2),
            SourceAmountValV2(SourceAmount::with_base0(1_100)),
        )?;

        assert_eq!(
            db_reader.first_scripts_utxos(2, &[script, script2])?,
            vec![
                [
                    Utxo {
                        amount: SourceAmount::with_base0(500),
                        tx_hash: Hash::default(),
                        output_index: 0,
                    },
                    Utxo {
                        amount: SourceAmount::with_base0(800),
                        tx_hash: Hash::default(),
                        output_index: 1,
                    },
                ]
                .iter()
                .copied()
                .collect::<ArrayVec<_>>(),
                [
                    Utxo {
                        amount: SourceAmount::with_base0(400),
                        tx_hash: Hash::default(),
                        output_index: 0,
                    },
                    Utxo {
                        amount: SourceAmount::with_base0(700),
                        tx_hash: Hash::default(),
                        output_index: 1,
                    },
                ]
                .iter()
                .copied()
                .collect::<ArrayVec<_>>()
            ]
        );

        Ok(())
    }

    #[test]
    fn test_find_script_utxos() -> anyhow::Result<()> {
        let script = WalletScriptV10::single_sig(PublicKey::default());

        let gva_db = duniter_gva_db::GvaV1Db::<Mem>::open(MemConf::default())?;
        let db_reader = create_dbs_reader(unsafe { std::mem::transmute(&gva_db.get_ro_handler()) });
        let txs_mp_db =
            duniter_dbs::databases::txs_mp_v2::TxsMpV2Db::<Mem>::open(MemConf::default())?;

        gva_db.gva_utxos_write().upsert(
            GvaUtxoIdDbV1::new(script.clone(), 0, Hash::default(), 0),
            SourceAmountValV2(SourceAmount::with_base0(500)),
        )?;
        gva_db.gva_utxos_write().upsert(
            GvaUtxoIdDbV1::new(script.clone(), 0, Hash::default(), 1),
            SourceAmountValV2(SourceAmount::with_base0(800)),
        )?;
        gva_db.gva_utxos_write().upsert(
            GvaUtxoIdDbV1::new(script.clone(), 0, Hash::default(), 2),
            SourceAmountValV2(SourceAmount::with_base0(1200)),
        )?;

        // Find utxos with amount target
        let PagedData {
            data: UtxosWithSum { utxos, sum },
            has_next_page,
            has_previous_page,
        } = db_reader.find_script_utxos(
            &txs_mp_db,
            Some(SourceAmount::with_base0(550)),
            PageInfo::default(),
            &script,
        )?;

        assert_eq!(
            utxos,
            vec![
                (
                    UtxoCursor {
                        block_number: BlockNumber(0),
                        tx_hash: Hash::default(),
                        output_index: 0,
                    },
                    SourceAmount::with_base0(500)
                ),
                (
                    UtxoCursor {
                        block_number: BlockNumber(0),
                        tx_hash: Hash::default(),
                        output_index: 1,
                    },
                    SourceAmount::with_base0(800)
                ),
            ]
        );
        assert_eq!(sum, SourceAmount::with_base0(1300));
        assert!(!has_next_page);
        assert!(!has_previous_page);

        // Find utxos with amount target in DESC order
        let PagedData {
            data: UtxosWithSum { utxos, sum },
            ..
        } = db_reader.find_script_utxos(
            &txs_mp_db,
            Some(SourceAmount::with_base0(550)),
            PageInfo {
                order: false,
                ..Default::default()
            },
            &script,
        )?;

        assert_eq!(
            utxos,
            vec![(
                UtxoCursor {
                    block_number: BlockNumber(0),
                    tx_hash: Hash::default(),
                    output_index: 2,
                },
                SourceAmount::with_base0(1200)
            ),]
        );
        assert_eq!(sum, SourceAmount::with_base0(1200));
        assert!(!has_next_page);
        assert!(!has_previous_page);

        // Find utxos with limit in DESC order
        let PagedData {
            data: UtxosWithSum { utxos, sum },
            has_previous_page,
            has_next_page,
        } = db_reader.find_script_utxos(
            &txs_mp_db,
            None,
            PageInfo {
                order: false,
                limit_opt: NonZeroUsize::new(2),
                ..Default::default()
            },
            &script,
        )?;

        assert_eq!(
            utxos,
            vec![
                (
                    UtxoCursor {
                        block_number: BlockNumber(0),
                        tx_hash: Hash::default(),
                        output_index: 2,
                    },
                    SourceAmount::with_base0(1200)
                ),
                (
                    UtxoCursor {
                        block_number: BlockNumber(0),
                        tx_hash: Hash::default(),
                        output_index: 1,
                    },
                    SourceAmount::with_base0(800)
                )
            ]
        );
        assert_eq!(sum, SourceAmount::with_base0(2000));
        assert!(!has_next_page);
        assert!(has_previous_page);

        Ok(())
    }
}

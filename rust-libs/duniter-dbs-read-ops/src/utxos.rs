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
use duniter_dbs::{GvaUtxoIdDbV1, SourceAmountValV2};

use crate::*;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct UtxoIdWithBlockNumber(pub UtxoIdV10, pub BlockNumber);
impl std::fmt::Display for UtxoIdWithBlockNumber {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}:{}:{}", self.1, self.0.tx_hash, self.0.output_index,)
    }
}

#[derive(Debug, Default)]
pub struct UtxosWithSum {
    pub utxos: Vec<(UtxoIdWithBlockNumber, SourceAmount)>,
    pub sum: SourceAmount,
}

pub fn find_script_utxos<GvaDb: GvaV1DbReadable, TxsMpDb: TxsMpV2DbReadable>(
    gva_db_ro: &GvaDb,
    txs_mp_db_ro: &TxsMpDb,
    amount_target_opt: Option<SourceAmount>,
    page_info: PageInfo<String>,
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
        gva_db_ro
            .gva_utxos()
            .iter(k_min..k_max, |it| {
                it.keys().filter_map(mempool_filter).next_res()
            })?
            .map(|gva_utxo_id| {
                format!(
                    "{}:{}:{}",
                    gva_utxo_id.get_block_number(),
                    gva_utxo_id.get_tx_hash(),
                    gva_utxo_id.get_output_index()
                )
            })
    } else {
        None
    };
    let last_cursor_opt = if page_info.not_all() {
        gva_db_ro
            .gva_utxos()
            .iter(k_min..k_max, |it| {
                it.keys().reverse().filter_map(mempool_filter).next_res()
            })?
            .map(|gva_utxo_id| {
                format!(
                    "{}:{}:{}",
                    gva_utxo_id.get_block_number(),
                    gva_utxo_id.get_tx_hash(),
                    gva_utxo_id.get_output_index()
                )
            })
    } else {
        None
    };
    if let Some(ref pos) = page_info.pos {
        let mut pos = pos.split(':');
        let block_number = pos
            .next()
            .ok_or_else(|| anyhow::Error::msg("invalid cursor"))?
            .parse()?;
        let tx_hash = Hash::from_hex(
            pos.next()
                .ok_or_else(|| anyhow::Error::msg("invalid cursor"))?,
        )?;
        let output_index = pos
            .next()
            .ok_or_else(|| anyhow::Error::msg("invalid cursor"))?
            .parse()?;
        if page_info.order {
            k_min = GvaUtxoIdDbV1::new_(script_hash, block_number, tx_hash, output_index);
        } else {
            k_max = GvaUtxoIdDbV1::new_(script_hash, block_number, tx_hash, output_index);
        }
    }
    let mut sum = SourceAmount::ZERO;

    let utxos = gva_db_ro.gva_utxos().iter(k_min..k_max, |mut it| {
        if !page_info.order {
            it = it.reverse();
        }
        let it = it.filter_map(|entry_res| match entry_res {
            Ok((gva_utxo_id, SourceAmountValV2(utxo_amount))) => {
                let tx_hash = gva_utxo_id.get_tx_hash();
                let output_index = gva_utxo_id.get_output_index() as u32;
                match txs_mp_db_ro
                    .utxos_ids()
                    .contains_key(&UtxoIdDbV2(tx_hash, output_index))
                {
                    Ok(false) => Some(Ok((
                        UtxoIdWithBlockNumber(
                            UtxoIdV10 {
                                tx_hash,
                                output_index: output_index as usize,
                            },
                            BlockNumber(gva_utxo_id.get_block_number()),
                        ),
                        utxo_amount,
                    ))),
                    Ok(true) => None,
                    Err(e) => Some(Err(e)),
                }
            }
            Err(e) => Some(Err(e)),
        });
        if let Some(limit) = page_info.limit_opt {
            if let Some(total_target) = amount_target_opt {
                it.take(limit)
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
                    .collect::<KvResult<Vec<_>>>()
            } else {
                it.take(limit).collect::<KvResult<Vec<_>>>()
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
            .collect::<KvResult<Vec<_>>>()
        } else {
            it.collect::<KvResult<Vec<_>>>()
        }
        /*let mut utxos = Vec::new();
        for entry_res in it {
            let (gva_utxo_id, SourceAmountValV2(utxo_amount)) = entry_res?;
            let tx_hash = gva_utxo_id.get_tx_hash();
            let output_index = gva_utxo_id.get_output_index() as u32;
            if !txs_mp_db_ro
                .utxos_ids()
                .contains_key(&UtxoIdDbV2(tx_hash, output_index))?
            {
                utxos.push((
                    gva_db_ro
                        .blockchain_time()
                        .get(&U32BE(gva_utxo_id.get_block_number()))?
                        .ok_or_else(|| {
                            KvError::DbCorrupted(format!(
                                "No gva time for block {}",
                                gva_utxo_id.get_block_number()
                            ))
                        })? as i64,
                    UtxoIdV10 {
                        tx_hash,
                        output_index: output_index as usize,
                    },
                    utxo_amount,
                ));

                total = total + utxo_amount;
                if let Some(total_target) = amount_target_opt {
                    if total >= total_target {
                        return Ok((utxos, total));
                    }
                }
            }
        }
        Ok::<_, KvError>((utxos, total))*/
    })?;

    if amount_target_opt.is_none() {
        sum = utxos.iter().map(|(_utxo_id_with_bn, sa)| *sa).sum();
    }

    let order = page_info.order;

    Ok(PagedData {
        has_next_page: has_next_page(
            utxos
                .iter()
                .map(|(utxo_id_with_bn, _sa)| utxo_id_with_bn.to_string()),
            last_cursor_opt,
            page_info.clone(),
            order,
        ),
        has_previous_page: has_previous_page(
            utxos
                .iter()
                .map(|(utxo_id_with_bn, _sa)| utxo_id_with_bn.to_string()),
            first_cursor_opt,
            page_info,
            order,
        ),
        data: UtxosWithSum { utxos, sum },
    })
}

#[cfg(test)]
mod tests {

    use super::*;
    use duniter_dbs::GvaV1DbWritable;
    use duniter_dbs::TxsMpV2DbWritable;

    #[test]
    fn test_find_script_utxos() -> anyhow::Result<()> {
        let script = WalletScriptV10::single_sig(PublicKey::default());

        let gva_db = duniter_dbs::gva_v1::GvaV1Db::<Mem>::open(MemConf::default())?;
        let txs_mp_db = duniter_dbs::txs_mp_v2::TxsMpV2Db::<Mem>::open(MemConf::default())?;

        gva_db.gva_utxos_write().upsert(
            GvaUtxoIdDbV1::new(script.clone(), 0, Hash::default(), 0),
            SourceAmountValV2(SourceAmount::with_base0(50)),
        )?;
        gva_db.gva_utxos_write().upsert(
            GvaUtxoIdDbV1::new(script.clone(), 0, Hash::default(), 1),
            SourceAmountValV2(SourceAmount::with_base0(80)),
        )?;
        gva_db.gva_utxos_write().upsert(
            GvaUtxoIdDbV1::new(script.clone(), 0, Hash::default(), 2),
            SourceAmountValV2(SourceAmount::with_base0(120)),
        )?;

        /*// Find utxos with amount target
        let PagedData {
            data: UtxosWithSum { utxos, sum },
            has_next_page,
            has_previous_page,
        } = find_script_utxos(
            &gva_db,
            &txs_mp_db,
            Some(SourceAmount::with_base0(55)),
            PageInfo::default(),
            &script,
        )?;

        assert_eq!(
            utxos,
            vec![
                (
                    UtxoIdWithBlockNumber(
                        UtxoIdV10 {
                            tx_hash: Hash::default(),
                            output_index: 0
                        },
                        BlockNumber(0),
                    ),
                    SourceAmount::with_base0(50)
                ),
                (
                    UtxoIdWithBlockNumber(
                        UtxoIdV10 {
                            tx_hash: Hash::default(),
                            output_index: 1
                        },
                        BlockNumber(0),
                    ),
                    SourceAmount::with_base0(80)
                ),
            ]
        );
        assert_eq!(sum, SourceAmount::with_base0(130));
        assert!(!has_next_page);
        assert!(!has_previous_page);

        // Find utxos with amount target in DESC order
        let PagedData {
            data: UtxosWithSum { utxos, sum },
            ..
        } = find_script_utxos(
            &gva_db,
            &txs_mp_db,
            Some(SourceAmount::with_base0(55)),
            PageInfo {
                order: false,
                ..Default::default()
            },
            &script,
        )?;

        assert_eq!(
            utxos,
            vec![(
                UtxoIdWithBlockNumber(
                    UtxoIdV10 {
                        tx_hash: Hash::default(),
                        output_index: 2
                    },
                    BlockNumber(0),
                ),
                SourceAmount::with_base0(120)
            ),]
        );
        assert_eq!(sum, SourceAmount::with_base0(120));
        assert!(!has_next_page);
        assert!(!has_previous_page);*/

        // Find utxos with limit in DESC order
        let PagedData {
            data: UtxosWithSum { utxos, sum },
            has_previous_page,
            has_next_page,
        } = find_script_utxos(
            &gva_db,
            &txs_mp_db,
            None,
            PageInfo {
                order: false,
                limit_opt: Some(2),
                ..Default::default()
            },
            &script,
        )?;

        assert_eq!(
            utxos,
            vec![
                (
                    UtxoIdWithBlockNumber(
                        UtxoIdV10 {
                            tx_hash: Hash::default(),
                            output_index: 2
                        },
                        BlockNumber(0),
                    ),
                    SourceAmount::with_base0(120)
                ),
                (
                    UtxoIdWithBlockNumber(
                        UtxoIdV10 {
                            tx_hash: Hash::default(),
                            output_index: 1
                        },
                        BlockNumber(0),
                    ),
                    SourceAmount::with_base0(80)
                )
            ]
        );
        assert_eq!(sum, SourceAmount::with_base0(200));
        assert!(!has_next_page);
        assert!(has_previous_page);

        Ok(())
    }
}

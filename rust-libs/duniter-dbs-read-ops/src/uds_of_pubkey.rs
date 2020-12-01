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
use duniter_dbs::{
    bc_v2::{BcV2Db, UdsEvent, UdsRevalEvent},
    GvaIdtyDbV1, GvaV1Db, UdIdV2,
};

#[derive(Debug, Default)]
pub struct UdsWithSum {
    pub uds: Vec<(BlockNumber, SourceAmount)>,
    pub sum: SourceAmount,
}

pub fn all_uds_of_pubkey<B: Backend>(
    bc_db: &BcV2Db<B>,
    gva_db: &GvaV1Db<B>,
    pubkey: PublicKey,
    page_info: PageInfo<u32>,
) -> KvResult<PagedData<UdsWithSum>> {
    (
        bc_db.uds_reval(),
        gva_db.blocks_with_ud(),
        gva_db.gva_identities(),
    )
        .read(|(uds_reval, blocks_with_ud, gva_identities)| {
            if let Some(gva_idty) = gva_identities.get(&PubKeyKeyV2(pubkey))? {
                match page_info.pos {
                    None => {
                        if page_info.order {
                            blocks_with_ud.iter(.., move |it| {
                                all_uds_of_pubkey_inner::<B, _>(
                                    gva_idty,
                                    page_info,
                                    it.keys().map_ok(|bn| BlockNumber(bn.0)),
                                    uds_reval,
                                    None,
                                )
                            })
                        } else {
                            let last_ud_opt =
                                blocks_with_ud.iter(.., |it| it.keys().reverse().next_res())?;
                            blocks_with_ud.iter(.., move |it| {
                                all_uds_of_pubkey_inner::<B, _>(
                                    gva_idty,
                                    page_info,
                                    it.keys().reverse().map_ok(|bn| BlockNumber(bn.0)),
                                    uds_reval,
                                    last_ud_opt.map(|bn| BlockNumber(bn.0)),
                                )
                            })
                        }
                    }
                    Some(pos) => {
                        if page_info.order {
                            blocks_with_ud.iter(U32BE(pos).., move |it| {
                                all_uds_of_pubkey_inner::<B, _>(
                                    gva_idty,
                                    page_info,
                                    it.keys().map_ok(|bn| BlockNumber(bn.0)),
                                    uds_reval,
                                    None,
                                )
                            })
                        } else {
                            let last_ud_opt =
                                blocks_with_ud.iter(.., |it| it.keys().reverse().next_res())?;
                            blocks_with_ud.iter(..=U32BE(pos), move |it| {
                                all_uds_of_pubkey_inner::<B, _>(
                                    gva_idty,
                                    page_info,
                                    it.keys().reverse().map_ok(|bn| BlockNumber(bn.0)),
                                    uds_reval,
                                    last_ud_opt.map(|bn| BlockNumber(bn.0)),
                                )
                            })
                        }
                    }
                }
            } else {
                Ok(PagedData::empty())
            }
        })
}

fn all_uds_of_pubkey_inner<B, I>(
    gva_idty: GvaIdtyDbV1,
    page_info: PageInfo<u32>,
    blocks_with_ud: I,
    uds_reval: TxColRo<B::Col, UdsRevalEvent>,
    last_ud_opt: Option<BlockNumber>,
) -> KvResult<PagedData<UdsWithSum>>
where
    B: Backend,
    I: Iterator<Item = KvResult<BlockNumber>>,
{
    let first_ud = gva_idty.first_ud;
    let mut blocks_numbers = filter_blocks_numbers(gva_idty, page_info, blocks_with_ud)?;

    if blocks_numbers.is_empty() {
        return Ok(PagedData::empty());
    }

    let not_reach_end = if page_info.order {
        if let Some(limit) = page_info.limit_opt {
            if blocks_numbers.len() <= limit {
                false
            } else {
                blocks_numbers.pop();
                true
            }
        } else {
            false
        }
    } else if let Some(last_ud) = last_ud_opt {
        blocks_numbers[0] != last_ud
    } else {
        false
    };
    let blocks_numbers_len = blocks_numbers.len();

    let first_block_number = if page_info.order {
        blocks_numbers[0]
    } else {
        blocks_numbers[blocks_numbers_len - 1]
    };

    let first_reval = uds_reval
        .iter(..=U32BE(first_block_number.0), |it| {
            it.reverse().keys().next_res()
        })?
        .expect("corrupted db");

    let uds_with_sum = if page_info.order {
        collect_uds(
            blocks_numbers.into_iter(),
            blocks_numbers_len,
            first_reval,
            uds_reval,
            None,
        )?
    } else {
        collect_uds(
            blocks_numbers.into_iter().rev(),
            blocks_numbers_len,
            first_reval,
            uds_reval,
            None,
        )?
    };

    Ok(PagedData {
        has_previous_page: has_previous_page(
            uds_with_sum.uds.iter().map(|(bn, _sa)| bn.0),
            first_ud.map(|bn| bn.0),
            page_info,
            true,
        ),
        has_next_page: not_reach_end,
        data: uds_with_sum,
    })
}

fn filter_blocks_numbers<I: Iterator<Item = KvResult<BlockNumber>>>(
    gva_idty: GvaIdtyDbV1,
    page_info: PageInfo<u32>,
    blocks_with_ud: I,
) -> KvResult<Vec<BlockNumber>> {
    let mut is_member_changes = SmallVec::<[BlockNumber; 4]>::new();
    for (join, leave) in gva_idty.joins.iter().zip(gva_idty.leaves.iter()) {
        is_member_changes.push(*join);
        is_member_changes.push(*leave);
    }
    if gva_idty.joins.len() > gva_idty.leaves.len() {
        is_member_changes.push(*gva_idty.joins.last().unwrap_or_else(|| unreachable!()));
    }

    if page_info.order {
        let mut i = 0;
        let mut is_member = false;
        if let Some(limit) = page_info.limit_opt {
            blocks_with_ud
                .filter_ok(|bn| {
                    while i < is_member_changes.len() && *bn >= is_member_changes[i] {
                        is_member = !is_member;
                        i += 1;
                    }
                    is_member
                })
                .take(limit + 1)
                .collect::<KvResult<Vec<_>>>()
        } else {
            blocks_with_ud
                .filter_ok(|bn| {
                    while i < is_member_changes.len() && *bn >= is_member_changes[i] {
                        is_member = !is_member;
                        i += 1;
                    }
                    is_member
                })
                .collect::<KvResult<Vec<_>>>()
        }
    } else {
        let is_member_changes: SmallVec<[BlockNumber; 4]> =
            is_member_changes.into_iter().rev().collect();
        let mut i = 0;
        let mut is_member = gva_idty.is_member;
        if let Some(limit) = page_info.limit_opt {
            blocks_with_ud
                .filter_ok(|bn| {
                    /*println!(
                        "TMP (bn, is_member_changes[{}])=({}, {})",
                        i, bn, is_member_changes[i]
                    );*/
                    while i < is_member_changes.len() && *bn < is_member_changes[i] {
                        is_member = !is_member;
                        i += 1;
                    }
                    is_member
                })
                .take(limit)
                .collect::<KvResult<Vec<_>>>()
        } else {
            blocks_with_ud
                .filter_ok(|bn| {
                    while i < is_member_changes.len() && *bn < is_member_changes[i] {
                        is_member = !is_member;
                        i += 1;
                    }
                    is_member
                })
                .collect::<KvResult<Vec<_>>>()
        }
    }
}

pub fn unspent_uds_of_pubkey<BcDb: BcV2DbReadable>(
    bc_db: &BcDb,
    pubkey: PublicKey,
    page_info: PageInfo<u32>,
    bn_to_exclude_opt: Option<&BTreeSet<BlockNumber>>,
    amount_target_opt: Option<SourceAmount>,
) -> KvResult<PagedData<UdsWithSum>> {
    (bc_db.uds(), bc_db.uds_reval()).read(|(uds, uds_reval)| {
        let (first_ud_opt, last_ud_opt) = if page_info.not_all() {
            get_first_and_last_unspent_ud(&uds, pubkey, bn_to_exclude_opt)?
        } else {
            (None, None)
        };
        let mut blocks_numbers = if let Some(pos) = page_info.pos {
            if page_info.order {
                uds.iter(
                    UdIdV2(pubkey, BlockNumber(pos))..UdIdV2(pubkey, BlockNumber(u32::MAX)),
                    |it| {
                        let it = it.keys().map_ok(|UdIdV2(_p, bn)| bn);
                        if let Some(bn_to_exclude) = bn_to_exclude_opt {
                            it.filter_ok(|bn| !bn_to_exclude.contains(&bn))
                                .collect::<KvResult<Vec<_>>>()
                        } else {
                            it.collect::<KvResult<Vec<_>>>()
                        }
                    },
                )?
            } else {
                uds.iter(
                    UdIdV2(pubkey, BlockNumber(0))..=UdIdV2(pubkey, BlockNumber(pos)),
                    |it| {
                        let it = it.keys().reverse().map_ok(|UdIdV2(_p, bn)| bn);
                        if let Some(bn_to_exclude) = bn_to_exclude_opt {
                            it.filter_ok(|bn| !bn_to_exclude.contains(&bn))
                                .collect::<KvResult<Vec<_>>>()
                        } else {
                            it.collect::<KvResult<Vec<_>>>()
                        }
                    },
                )?
            }
        } else if page_info.order {
            uds.iter(
                UdIdV2(pubkey, BlockNumber(0))..UdIdV2(pubkey, BlockNumber(u32::MAX)),
                |it| {
                    let it = it.keys().map_ok(|UdIdV2(_p, bn)| bn);
                    if let Some(bn_to_exclude) = bn_to_exclude_opt {
                        it.filter_ok(|bn| !bn_to_exclude.contains(&bn))
                            .collect::<KvResult<Vec<_>>>()
                    } else {
                        it.collect::<KvResult<Vec<_>>>()
                    }
                },
            )?
        } else {
            uds.iter(
                UdIdV2(pubkey, BlockNumber(0))..UdIdV2(pubkey, BlockNumber(u32::MAX)),
                |it| {
                    let it = it.keys().reverse().map_ok(|UdIdV2(_p, bn)| bn);
                    if let Some(bn_to_exclude) = bn_to_exclude_opt {
                        it.filter_ok(|bn| !bn_to_exclude.contains(&bn))
                            .collect::<KvResult<Vec<_>>>()
                    } else {
                        it.collect::<KvResult<Vec<_>>>()
                    }
                },
            )?
        };

        if blocks_numbers.is_empty() {
            Ok(PagedData::empty())
        } else {
            if let Some(limit) = page_info.limit_opt {
                blocks_numbers.truncate(limit);
            }
            let first_block_number = if page_info.order {
                blocks_numbers[0]
            } else {
                blocks_numbers[blocks_numbers.len() - 1]
            };
            let first_reval = uds_reval
                .iter(..=U32BE(first_block_number.0), |it| {
                    it.reverse().keys().next_res()
                })?
                .expect("corrupted db");
            let blocks_numbers_len = blocks_numbers.len();
            let blocks_numbers = blocks_numbers.into_iter();
            let uds_with_sum = if page_info.order {
                collect_uds(
                    blocks_numbers,
                    blocks_numbers_len,
                    first_reval,
                    uds_reval,
                    amount_target_opt,
                )?
            } else {
                collect_uds(
                    blocks_numbers.rev(),
                    blocks_numbers_len,
                    first_reval,
                    uds_reval,
                    amount_target_opt,
                )?
            };
            Ok(PagedData {
                has_previous_page: has_previous_page(
                    uds_with_sum.uds.iter().map(|(bn, _sa)| bn.0),
                    first_ud_opt.map(|bn| bn.0),
                    page_info,
                    true,
                ),
                has_next_page: has_next_page(
                    uds_with_sum.uds.iter().map(|(bn, _sa)| bn.0),
                    last_ud_opt.map(|bn| bn.0),
                    page_info,
                    true,
                ),
                data: uds_with_sum,
            })
        }
    })
}

fn get_first_and_last_unspent_ud<BC: BackendCol>(
    uds: &TxColRo<BC, UdsEvent>,
    pubkey: PublicKey,
    bn_to_exclude_opt: Option<&BTreeSet<BlockNumber>>,
) -> KvResult<(Option<BlockNumber>, Option<BlockNumber>)> {
    if let Some(bn_to_exclude) = bn_to_exclude_opt {
        uds.iter(
            UdIdV2(pubkey, BlockNumber(0))..UdIdV2(pubkey, BlockNumber(u32::MAX)),
            |it| {
                let mut it = it.keys();
                Ok((
                    loop {
                        if let Some(UdIdV2(_p, bn)) = it.next_res()? {
                            if !bn_to_exclude.contains(&bn) {
                                break Some(bn);
                            }
                        } else {
                            break None;
                        }
                    },
                    it.reverse()
                        .filter_map_ok(|UdIdV2(_p, bn)| {
                            if !bn_to_exclude.contains(&bn) {
                                Some(bn)
                            } else {
                                None
                            }
                        })
                        .next_res()?,
                ))
            },
        )
    } else {
        uds.iter(
            UdIdV2(pubkey, BlockNumber(0))..UdIdV2(pubkey, BlockNumber(u32::MAX)),
            |it| {
                let mut it = it.keys();
                Ok((
                    it.next_res()?.map(|UdIdV2(_p, bn)| bn),
                    it.reverse().next_res()?.map(|UdIdV2(_p, bn)| bn),
                ))
            },
        )
    }
}

macro_rules! collect_one_ud {
    ($block_number:ident, $current_ud:ident, $uds:ident, $sum:ident, $amount_target_opt:ident) => {
        $uds.push(($block_number, $current_ud));
        $sum = $sum + $current_ud;
        if let Some(amount_target) = $amount_target_opt {
            if $sum >= amount_target {
                return Ok(UdsWithSum { $uds, $sum });
            }
        }
    };
}

fn collect_uds<BC: BackendCol, I: Iterator<Item = BlockNumber>>(
    mut blocks_numbers: I,
    blocks_numbers_len: usize,
    first_reval: U32BE,
    uds_reval: TxColRo<BC, UdsRevalEvent>,
    amount_opt: Option<SourceAmount>,
) -> KvResult<UdsWithSum> {
    let uds_revals = uds_reval.iter(first_reval.., |it| it.collect::<KvResult<Vec<_>>>())?;

    if uds_revals.is_empty() {
        Ok(UdsWithSum::default())
    } else {
        let mut current_ud = (uds_revals[0].1).0;
        let mut uds = Vec::with_capacity(blocks_numbers_len);
        let mut sum = SourceAmount::ZERO;

        // Uds before last reval
        for (block_reval, amount_reval) in &uds_revals[1..] {
            'blocks_numbers: while let Some(block_number) = blocks_numbers.next() {
                if block_number.0 >= block_reval.0 {
                    current_ud = amount_reval.0;
                    collect_one_ud!(block_number, current_ud, uds, sum, amount_opt);
                    break 'blocks_numbers;
                } else {
                    collect_one_ud!(block_number, current_ud, uds, sum, amount_opt);
                }
            }
        }

        // Uds after last reval
        for block_number in blocks_numbers {
            collect_one_ud!(block_number, current_ud, uds, sum, amount_opt);
        }

        Ok(UdsWithSum { uds, sum })
    }
}

#[cfg(test)]
mod tests {

    use super::*;
    use duniter_dbs::smallvec::smallvec as svec;
    use duniter_dbs::{bc_v2::BcV2DbWritable, GvaV1DbWritable, SourceAmountValV2, UdIdV2};
    use std::iter::FromIterator;

    #[test]
    fn test_filter_blocks_numbers() -> KvResult<()> {
        let idty = GvaIdtyDbV1 {
            is_member: true,
            joins: svec![BlockNumber(26), BlockNumber(51)],
            leaves: BTreeSet::from_iter([BlockNumber(32)].iter().copied()),
            first_ud: Some(BlockNumber(29)),
        };
        let blocks_with_ud = vec![
            BlockNumber(3),
            BlockNumber(9),
            BlockNumber(15),
            BlockNumber(22),
            BlockNumber(29),
            BlockNumber(35),
            BlockNumber(42),
            BlockNumber(48),
            BlockNumber(54),
            BlockNumber(60),
        ];

        assert_eq!(
            filter_blocks_numbers(
                idty.clone(),
                PageInfo {
                    pos: None,
                    order: true,
                    limit_opt: Some(1),
                },
                blocks_with_ud.iter().copied().map(Ok),
            )?,
            vec![BlockNumber(29), BlockNumber(54)]
        );
        assert_eq!(
            filter_blocks_numbers(
                idty,
                PageInfo {
                    pos: None,
                    order: false,
                    limit_opt: None,
                },
                blocks_with_ud.into_iter().rev().map(Ok),
            )?,
            vec![BlockNumber(60), BlockNumber(54), BlockNumber(29)]
        );
        Ok(())
    }

    #[test]
    fn test_all_uds_of_pubkey() -> KvResult<()> {
        let pk = PublicKey::default();
        let idty = GvaIdtyDbV1 {
            is_member: true,
            joins: svec![BlockNumber(26), BlockNumber(51)],
            leaves: BTreeSet::from_iter([BlockNumber(32)].iter().copied()),
            first_ud: Some(BlockNumber(29)),
        };

        let bc_db = duniter_dbs::bc_v2::BcV2Db::<Mem>::open(MemConf::default())?;
        let gva_db = duniter_dbs::gva_v1::GvaV1Db::<Mem>::open(MemConf::default())?;

        bc_db
            .uds_reval_write()
            .upsert(U32BE(0), SourceAmountValV2(SourceAmount::with_base0(10)))?;
        bc_db
            .uds_reval_write()
            .upsert(U32BE(40), SourceAmountValV2(SourceAmount::with_base0(12)))?;
        gva_db
            .gva_identities_write()
            .upsert(PubKeyKeyV2(pk), idty)?;
        gva_db.blocks_with_ud_write().upsert(U32BE(22), ())?;
        gva_db.blocks_with_ud_write().upsert(U32BE(29), ())?;
        gva_db.blocks_with_ud_write().upsert(U32BE(35), ())?;
        gva_db.blocks_with_ud_write().upsert(U32BE(42), ())?;
        gva_db.blocks_with_ud_write().upsert(U32BE(48), ())?;
        gva_db.blocks_with_ud_write().upsert(U32BE(54), ())?;
        gva_db.blocks_with_ud_write().upsert(U32BE(60), ())?;

        // Get all uds
        let PagedData {
            data: UdsWithSum { uds, sum },
            has_previous_page,
            has_next_page,
        } = all_uds_of_pubkey(&bc_db, &gva_db, pk, PageInfo::default())?;
        assert_eq!(
            uds,
            vec![
                (BlockNumber(29), SourceAmount::with_base0(10)),
                (BlockNumber(54), SourceAmount::with_base0(12)),
                (BlockNumber(60), SourceAmount::with_base0(12)),
            ]
        );
        assert_eq!(sum, SourceAmount::with_base0(34));
        assert!(!has_previous_page);
        assert!(!has_next_page);

        // Get all uds with limit
        let PagedData {
            data: UdsWithSum { uds, sum },
            has_previous_page,
            has_next_page,
        } = all_uds_of_pubkey(
            &bc_db,
            &gva_db,
            pk,
            PageInfo {
                limit_opt: Some(2),
                ..Default::default()
            },
        )?;
        assert_eq!(
            uds,
            vec![
                (BlockNumber(29), SourceAmount::with_base0(10)),
                (BlockNumber(54), SourceAmount::with_base0(12)),
            ]
        );
        assert_eq!(sum, SourceAmount::with_base0(22));
        assert!(!has_previous_page);
        assert!(has_next_page);

        // Get all uds from particular position
        let PagedData {
            data: UdsWithSum { uds, sum },
            has_previous_page,
            has_next_page,
        } = all_uds_of_pubkey(
            &bc_db,
            &gva_db,
            pk,
            PageInfo {
                pos: Some(50),
                ..Default::default()
            },
        )?;
        assert_eq!(
            uds,
            vec![
                (BlockNumber(54), SourceAmount::with_base0(12)),
                (BlockNumber(60), SourceAmount::with_base0(12)),
            ]
        );
        assert_eq!(sum, SourceAmount::with_base0(24));
        assert!(has_previous_page);
        assert!(!has_next_page);

        // Get all uds on DESC order
        let PagedData {
            data: UdsWithSum { uds, sum },
            has_previous_page,
            has_next_page,
        } = all_uds_of_pubkey(
            &bc_db,
            &gva_db,
            pk,
            PageInfo {
                order: false,
                ..Default::default()
            },
        )?;
        assert_eq!(
            uds,
            vec![
                (BlockNumber(29), SourceAmount::with_base0(10)),
                (BlockNumber(54), SourceAmount::with_base0(12)),
                (BlockNumber(60), SourceAmount::with_base0(12)),
            ]
        );
        assert_eq!(sum, SourceAmount::with_base0(34));
        assert!(!has_previous_page);
        assert!(!has_next_page);

        // Get all uds on DESC order with limit
        let PagedData {
            data: UdsWithSum { uds, sum },
            has_previous_page,
            has_next_page,
        } = all_uds_of_pubkey(
            &bc_db,
            &gva_db,
            pk,
            PageInfo {
                order: false,
                limit_opt: Some(2),
                ..Default::default()
            },
        )?;
        assert_eq!(
            uds,
            vec![
                (BlockNumber(54), SourceAmount::with_base0(12)),
                (BlockNumber(60), SourceAmount::with_base0(12)),
            ]
        );
        assert_eq!(sum, SourceAmount::with_base0(24));
        assert!(has_previous_page);
        assert!(!has_next_page);

        // Get all uds on DESC order from particular position
        let PagedData {
            data: UdsWithSum { uds, sum },
            has_previous_page,
            has_next_page,
        } = all_uds_of_pubkey(
            &bc_db,
            &gva_db,
            pk,
            PageInfo {
                pos: Some(55),
                order: false,
                ..Default::default()
            },
        )?;
        assert_eq!(
            uds,
            vec![
                (BlockNumber(29), SourceAmount::with_base0(10)),
                (BlockNumber(54), SourceAmount::with_base0(12)),
            ]
        );
        assert_eq!(sum, SourceAmount::with_base0(22));
        assert!(!has_previous_page);
        assert!(has_next_page);

        Ok(())
    }

    #[test]
    fn test_unspent_uds_of_pubkey() -> KvResult<()> {
        let pk = PublicKey::default();
        let bc_db = duniter_dbs::bc_v2::BcV2Db::<Mem>::open(MemConf::default())?;

        bc_db
            .uds_reval_write()
            .upsert(U32BE(0), SourceAmountValV2(SourceAmount::with_base0(10)))?;
        bc_db
            .uds_reval_write()
            .upsert(U32BE(40), SourceAmountValV2(SourceAmount::with_base0(12)))?;

        bc_db.uds_write().upsert(UdIdV2(pk, BlockNumber(0)), ())?;
        bc_db.uds_write().upsert(UdIdV2(pk, BlockNumber(10)), ())?;
        bc_db.uds_write().upsert(UdIdV2(pk, BlockNumber(20)), ())?;
        bc_db.uds_write().upsert(UdIdV2(pk, BlockNumber(30)), ())?;
        bc_db.uds_write().upsert(UdIdV2(pk, BlockNumber(40)), ())?;
        bc_db.uds_write().upsert(UdIdV2(pk, BlockNumber(50)), ())?;
        bc_db.uds_write().upsert(UdIdV2(pk, BlockNumber(60)), ())?;

        // Get unspent uds
        let PagedData {
            data: UdsWithSum { uds, sum },
            has_previous_page,
            has_next_page,
        } = unspent_uds_of_pubkey(&bc_db, pk, PageInfo::default(), None, None)?;
        assert_eq!(uds.len(), 7);
        assert_eq!(
            uds.first(),
            Some(&(BlockNumber(0), SourceAmount::with_base0(10)))
        );
        assert_eq!(
            uds.last(),
            Some(&(BlockNumber(60), SourceAmount::with_base0(12)))
        );
        assert_eq!(sum, SourceAmount::with_base0(76));
        assert!(!has_previous_page);
        assert!(!has_next_page);

        // Get unspent uds from particular position
        let PagedData {
            data: UdsWithSum { uds, sum },
            has_previous_page,
            has_next_page,
        } = unspent_uds_of_pubkey(
            &bc_db,
            pk,
            PageInfo {
                pos: Some(30),
                ..Default::default()
            },
            None,
            None,
        )?;
        assert_eq!(uds.len(), 4);
        assert_eq!(
            uds.first(),
            Some(&(BlockNumber(30), SourceAmount::with_base0(10)))
        );
        assert_eq!(
            uds.last(),
            Some(&(BlockNumber(60), SourceAmount::with_base0(12)))
        );
        assert_eq!(sum, SourceAmount::with_base0(46));
        assert!(has_previous_page);
        assert!(!has_next_page);

        // Get unspent uds in order DESC
        let PagedData {
            data: UdsWithSum { uds, sum },
            has_previous_page,
            has_next_page,
        } = unspent_uds_of_pubkey(
            &bc_db,
            pk,
            PageInfo {
                order: false,
                ..Default::default()
            },
            None,
            None,
        )?;
        assert_eq!(uds.len(), 7);
        assert_eq!(
            uds.first(),
            Some(&(BlockNumber(0), SourceAmount::with_base0(10)))
        );
        assert_eq!(
            uds.last(),
            Some(&(BlockNumber(60), SourceAmount::with_base0(12)))
        );
        assert_eq!(sum, SourceAmount::with_base0(76));
        assert!(!has_previous_page);
        assert!(!has_next_page);

        // Get unspent uds in order DESC from particular position
        let PagedData {
            data: UdsWithSum { uds, sum },
            has_previous_page,
            has_next_page,
        } = unspent_uds_of_pubkey(
            &bc_db,
            pk,
            PageInfo {
                pos: Some(40),
                order: false,
                ..Default::default()
            },
            None,
            None,
        )?;
        assert_eq!(uds.len(), 5);
        assert_eq!(
            uds.first(),
            Some(&(BlockNumber(0), SourceAmount::with_base0(10)))
        );
        assert_eq!(
            uds.last(),
            Some(&(BlockNumber(40), SourceAmount::with_base0(12)))
        );
        assert_eq!(sum, SourceAmount::with_base0(52));
        assert!(!has_previous_page);
        assert!(has_next_page);

        Ok(())
    }
}

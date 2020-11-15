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
use duniter_dbs::bc_v2::UdsRevalEvent;
use duniter_dbs::UdIdV2;

pub fn uds_of_pubkey<DB: BcV2DbReadable, R: 'static + RangeBounds<BlockNumber>>(
    bc_db: &DB,
    pubkey: PublicKey,
    range: R,
    limit_opt: Option<usize>,
    total_opt: Option<SourceAmount>,
) -> KvResult<(Vec<(BlockNumber, SourceAmount)>, SourceAmount)> {
    let start = match range.start_bound() {
        Bound::Included(start_block) => UdIdV2(pubkey, *start_block),
        Bound::Excluded(start_block) => UdIdV2(pubkey, BlockNumber(start_block.0 + 1)),
        Bound::Unbounded => UdIdV2(pubkey, BlockNumber(0)),
    };
    let end = match range.end_bound() {
        Bound::Included(end_block) => UdIdV2(pubkey, *end_block),
        Bound::Excluded(end_block) => UdIdV2(pubkey, BlockNumber(end_block.0 - 1)),
        Bound::Unbounded => UdIdV2(pubkey, BlockNumber(u32::MAX)),
    };
    (bc_db.uds(), bc_db.uds_reval()).read(|(uds, uds_reval)| {
        let blocks_numbers = uds.iter(start..end, |it| {
            it.keys()
                .map_ok(|UdIdV2(_p, bn)| bn)
                .collect::<KvResult<Vec<_>>>()
        })?;
        if blocks_numbers.is_empty() {
            Ok((vec![], SourceAmount::ZERO))
        } else {
            let first_reval = uds_reval
                .iter(..=U32BE(blocks_numbers[0].0), |it| {
                    it.reverse().keys().next_res()
                })?
                .expect("corrupted db");
            let blocks_numbers = blocks_numbers.into_iter();
            if let Some(limit) = limit_opt {
                collect_uds(
                    blocks_numbers.take(limit),
                    first_reval,
                    uds_reval,
                    total_opt,
                )
            } else {
                collect_uds(blocks_numbers, first_reval, uds_reval, total_opt)
            }
        }
    })
}

fn collect_uds<BC: BackendCol, I: ExactSizeIterator<Item = BlockNumber>>(
    mut blocks_numbers: I,
    first_reval: U32BE,
    uds_reval: TxColRo<BC, UdsRevalEvent>,
    amount_opt: Option<SourceAmount>,
) -> KvResult<(Vec<(BlockNumber, SourceAmount)>, SourceAmount)> {
    let uds_revals = uds_reval.iter(first_reval.., |it| it.collect::<KvResult<Vec<_>>>())?;

    if uds_revals.is_empty() {
        Ok((vec![], SourceAmount::ZERO))
    } else {
        let mut current_ud = (uds_revals[0].1).0;
        let mut uds = Vec::with_capacity(blocks_numbers.len());
        let mut sum = SourceAmount::ZERO;

        // Uds before last reval
        for (block_reval, amount_reval) in &uds_revals[1..] {
            'blocks_numbers: while let Some(block_number) = blocks_numbers.next() {
                if block_number.0 >= block_reval.0 {
                    current_ud = amount_reval.0;
                    uds.push((block_number, current_ud));
                    sum = sum + current_ud;
                    if let Some(amount_target) = amount_opt {
                        if sum >= amount_target {
                            return Ok((uds, sum));
                        }
                    }
                    break 'blocks_numbers;
                } else {
                    uds.push((block_number, current_ud));
                    sum = sum + current_ud;
                    if let Some(amount_target) = amount_opt {
                        if sum >= amount_target {
                            return Ok((uds, sum));
                        }
                    }
                }
            }
        }

        // Uds after last reval
        for block_number in blocks_numbers {
            uds.push((block_number, current_ud));
            sum = sum + current_ud;
            if let Some(amount_target) = amount_opt {
                if sum >= amount_target {
                    return Ok((uds, sum));
                }
            }
        }

        Ok((uds, sum))
    }
}

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

pub fn uds_of_pubkey<BcDb: BcV2DbReadable, R: 'static + RangeBounds<BlockNumber>>(
    bc_db: &BcDb,
    pubkey: PublicKey,
    range: R,
    bn_to_exclude_opt: Option<&BTreeSet<BlockNumber>>,
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
            Ok((Vec::default(), SourceAmount::ZERO))
        } else {
            let first_reval = uds_reval
                .iter(..=U32BE(blocks_numbers[0].0), |it| {
                    it.reverse().keys().next_res()
                })?
                .expect("corrupted db");
            let blocks_numbers_len = blocks_numbers.len();
            let blocks_numbers = blocks_numbers.into_iter().filter(|bn| {
                if let Some(bn_to_exclude) = bn_to_exclude_opt {
                    !bn_to_exclude.contains(bn)
                } else {
                    true
                }
            });
            collect_uds(
                blocks_numbers,
                blocks_numbers_len,
                first_reval,
                uds_reval,
                total_opt,
            )
        }
    })
}

macro_rules! collect_one_ud {
    ($block_number:ident, $current_ud:ident, $uds:ident, $sum:ident, $amount_target_opt:ident) => {
        $uds.push(($block_number, $current_ud));
        $sum = $sum + $current_ud;
        if let Some(amount_target) = $amount_target_opt {
            if $sum >= amount_target {
                return Ok(($uds, $sum));
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
) -> KvResult<(Vec<(BlockNumber, SourceAmount)>, SourceAmount)> {
    let uds_revals = uds_reval.iter(first_reval.., |it| it.collect::<KvResult<Vec<_>>>())?;

    if uds_revals.is_empty() {
        Ok((Vec::default(), SourceAmount::ZERO))
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

        Ok((uds, sum))
    }
}

#[cfg(test)]
mod tests {

    use super::*;
    use duniter_dbs::{bc_v2::BcV2DbWritable, SourceAmountValV2, UdIdV2};

    #[test]
    fn test_uds_of_pubkey() -> KvResult<()> {
        let bc_db = duniter_dbs::bc_v2::BcV2Db::<Mem>::open(MemConf::default())?;

        let pk = PublicKey::default();

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

        // Get all uds
        let (uds, uds_sum) = uds_of_pubkey(&bc_db, pk, .., None, None)?;
        assert_eq!(uds.len(), 7);
        assert_eq!(
            uds.first(),
            Some(&(BlockNumber(0), SourceAmount::with_base0(10)))
        );
        assert_eq!(
            uds.last(),
            Some(&(BlockNumber(60), SourceAmount::with_base0(12)))
        );
        assert_eq!(uds_sum, SourceAmount::with_base0(76));

        Ok(())
    }
}

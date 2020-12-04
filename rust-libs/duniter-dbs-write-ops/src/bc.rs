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

mod identities;
mod txs;
mod uds;

use crate::*;
use duniter_dbs::bc_v2::BcV2DbWritable;

pub fn apply_block<B: Backend>(
    bc_db: &duniter_dbs::bc_v2::BcV2Db<B>,
    block: &DubpBlockV10,
) -> KvResult<BlockMetaV2> {
    //log::info!("apply_block #{}", block.number().0);
    let block_meta = BlockMetaV2 {
        version: 10,
        number: block.number().0,
        hash: block.hash().0,
        issuer: block.issuer(),
        signature: block.signature(),
        inner_hash: block.inner_hash(),
        previous_hash: block.previous_hash(),
        pow_min: block.pow_min() as u32,
        members_count: block.members_count() as u64,
        issuers_count: block.issuers_count() as u32,
        median_time: block.common_time(),
        dividend: block.dividend(),
        unit_base: block.unit_base() as u32,
        ..Default::default()
    };

    (
        bc_db.blocks_meta_write(),
        bc_db.identities_write(),
        bc_db.txs_hashs_write(),
        bc_db.uds_write(),
        bc_db.uds_reval_write(),
        bc_db.uids_index_write(),
    )
        .write(
            |(
                mut blocks_meta,
                mut identities,
                mut txs_hashs,
                mut uds,
                mut uds_reval,
                mut uids_index,
            )| {
                blocks_meta.upsert(U32BE(block.number().0), block_meta);
                identities::update_identities::<B>(&block, &mut identities)?;
                for idty in block.identities() {
                    let pubkey = idty.issuers()[0];
                    let username = idty.username().to_owned();
                    uids_index.upsert(username, PubKeyValV2(pubkey));
                }
                if let Some(dividend) = block.dividend() {
                    uds::create_uds::<B>(
                        block.number(),
                        dividend,
                        &mut identities,
                        &mut uds,
                        &mut uds_reval,
                    )?;
                }
                txs::apply_txs::<B>(block.transactions(), &mut txs_hashs, &mut uds)?;
                Ok(())
            },
        )?;

    Ok(block_meta)
}

pub fn revert_block<B: Backend>(
    bc_db: &duniter_dbs::bc_v2::BcV2Db<B>,
    block: &DubpBlockV10,
) -> KvResult<Option<BlockMetaV2>> {
    (
        bc_db.blocks_meta_write(),
        bc_db.identities_write(),
        bc_db.txs_hashs_write(),
        bc_db.uds_write(),
        bc_db.uds_reval_write(),
        bc_db.uids_index_write(),
    )
        .write(
            |(
                mut blocks_meta,
                mut identities,
                mut txs_hashs,
                mut uds,
                mut uds_reval,
                mut uids_index,
            )| {
                txs::revert_txs::<B>(block.transactions(), &mut txs_hashs, &mut uds)?;
                if block.dividend().is_some() {
                    uds::revert_uds::<B>(
                        block.number(),
                        &mut identities,
                        &mut uds,
                        &mut uds_reval,
                    )?;
                }
                identities::revert_identities::<B>(&block, &mut identities)?;
                for idty in block.identities() {
                    let username = idty.username().to_owned();
                    uids_index.remove(username);
                }
                blocks_meta.remove(U32BE(block.number().0));
                Ok(if block.number() == BlockNumber(0) {
                    None
                } else {
                    blocks_meta.get(&U32BE(block.number().0 - 1))?
                })
            },
        )
}

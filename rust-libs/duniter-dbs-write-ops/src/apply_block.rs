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

pub fn apply_block(
    block: DubpBlockV10,
    current_opt: Option<BlockMetaV2>,
    dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<DuniterDbs<FileBackend>>,
    gva: bool,
    throw_chainability: bool,
) -> KvResult<BlockMetaV2> {
    if let Some(current) = current_opt {
        if block.number().0 == current.number + 1 {
            apply_block_inner(dbs_pool, Arc::new(block), gva)
        } else if throw_chainability {
            Err(KvError::Custom(
                format!(
                    "block #{} not chainable on current #{}",
                    block.number().0,
                    current.number
                )
                .into(),
            ))
        } else {
            Ok(current)
        }
    } else if block.number() == BlockNumber(0) {
        apply_block_inner(dbs_pool, Arc::new(block), gva)
    } else {
        Err(KvError::Custom(
            "Try to apply non genesis block on empty blockchain".into(),
        ))
    }
}

#[inline(always)]
pub fn apply_chunk(
    current_opt: Option<BlockMetaV2>,
    dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<DuniterDbs<FileBackend>>,
    blocks: Vec<DubpBlockV10>,
    gva: bool,
) -> KvResult<BlockMetaV2> {
    verify_chunk_chainability(current_opt, &blocks)?;
    apply_chunk_inner(dbs_pool, Arc::new(blocks), gva)
}

fn verify_chunk_chainability(
    current_opt: Option<BlockMetaV2>,
    blocks: &[DubpBlockV10],
) -> KvResult<()> {
    if let Some(mut current) = current_opt {
        for block in blocks {
            if block.number().0 == current.number + 1 {
                current.number += 1;
            } else {
                return Err(KvError::Custom(
                    format!(
                        "block #{} not chainable on current #{}",
                        blocks[0].number().0,
                        current.number
                    )
                    .into(),
                ));
            }
        }
        Ok(())
    } else if blocks[0].number() == BlockNumber(0) {
        let mut current_number = 0;
        for block in &blocks[1..] {
            if block.number().0 == current_number + 1 {
                current_number += 1;
            } else {
                return Err(KvError::Custom(
                    format!(
                        "block #{} not chainable on current #{}",
                        block.number().0,
                        current_number
                    )
                    .into(),
                ));
            }
        }
        Ok(())
    } else {
        Err(KvError::Custom(
            "Try to apply non genesis block on empty blockchain".into(),
        ))
    }
}

fn apply_block_inner(
    dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<DuniterDbs<FileBackend>>,
    block: Arc<DubpBlockV10>,
    gva: bool,
) -> KvResult<BlockMetaV2> {
    // Bc
    let block_arc = Arc::clone(&block);
    let bc_recv = dbs_pool
        .launch(move |dbs| crate::bc::apply_block(&dbs.bc_db, &block_arc))
        .expect("dbs pool disconnected");
    //TxsMp
    let block_arc = Arc::clone(&block);
    let txs_mp_recv = dbs_pool
        .launch(move |dbs| {
            crate::txs_mp::apply_block(block_arc.transactions(), &dbs.txs_mp_db)?;
            Ok::<_, KvError>(())
        })
        .expect("dbs pool disconnected");
    // Gva
    if gva {
        let block_arc = Arc::clone(&block);
        dbs_pool
            .execute(move |dbs| {
                crate::gva::apply_block(&block_arc, &dbs.gva_db)?;
                Ok::<_, KvError>(())
            })
            .expect("dbs pool disconnected")?;
    }
    txs_mp_recv.join().expect("dbs pool disconnected")?;
    bc_recv.join().expect("dbs pool disconnected")
}

fn apply_chunk_inner(
    dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<DuniterDbs<FileBackend>>,
    blocks: Arc<Vec<DubpBlockV10>>,
    gva: bool,
) -> KvResult<BlockMetaV2> {
    // Bc
    let blocks_len = blocks.len();
    let blocks_arc = Arc::clone(&blocks);
    //log::info!("apply_chunk: launch bc job...");
    let bc_handle = dbs_pool
        .launch(move |dbs| {
            for block in &blocks_arc[..(blocks_len - 1)] {
                crate::bc::apply_block(&dbs.bc_db, block)?;
            }
            crate::bc::apply_block(&dbs.bc_db, &blocks_arc[blocks_len - 1])
        })
        .expect("apply_chunk_inner:bc: dbs pool disconnected");
    //TxsMp
    let blocks_arc = Arc::clone(&blocks);
    //log::info!("apply_chunk: launch txs_mp job...");
    let txs_mp_handle = dbs_pool
        .launch(move |dbs| {
            for block in blocks_arc.deref() {
                crate::txs_mp::apply_block(block.transactions(), &dbs.txs_mp_db)?;
            }
            Ok::<_, KvError>(())
        })
        .expect("apply_chunk_inner:txs_mp: dbs pool disconnected");
    // Gva
    if gva {
        let blocks_arc = Arc::clone(&blocks);
        //log::info!("apply_chunk: launch gva job...");
        dbs_pool
            .execute(move |dbs| {
                for block in blocks_arc.deref() {
                    crate::gva::apply_block(&block, &dbs.gva_db)?;
                }
                Ok::<_, KvError>(())
            })
            .expect("apply_chunk_inner:gva: dbs pool disconnected")?;
        //log::info!("apply_chunk: gva job finish.");
    }
    txs_mp_handle
        .join()
        .expect("txs_mp_recv: dbs pool disconnected")?;
    //log::info!("apply_chunk: txs_mp job finish.");
    bc_handle.join().expect("bc_recv: dbs pool disconnected")
}

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
    bc_db: &BcV2Db<FileBackend>,
    block: Arc<DubpBlockV10>,
    current_opt: Option<BlockMetaV2>,
    dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<SharedDbs<FileBackend>>,
    global_sender: &flume::Sender<GlobalBackGroundTaskMsg>,
    throw_chainability: bool,
) -> KvResult<BlockMetaV2> {
    if let Some(current) = current_opt {
        if block.number().0 == current.number + 1 {
            apply_block_inner(bc_db, dbs_pool, block, global_sender)
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
        apply_block_inner(bc_db, dbs_pool, block, global_sender)
    } else {
        Err(KvError::Custom(
            "Try to apply non genesis block on empty blockchain".into(),
        ))
    }
}

#[inline(always)]
pub fn apply_chunk(
    bc_db: &BcV2Db<FileBackend>,
    current_opt: Option<BlockMetaV2>,
    dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<SharedDbs<FileBackend>>,
    blocks: Arc<[DubpBlockV10]>,
    global_sender: Option<&flume::Sender<GlobalBackGroundTaskMsg>>,
) -> KvResult<BlockMetaV2> {
    verify_chunk_chainability(current_opt, &blocks)?;
    apply_chunk_inner(bc_db, dbs_pool, blocks, global_sender)
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
    bc_db: &BcV2Db<FileBackend>,
    dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<SharedDbs<FileBackend>>,
    block: Arc<DubpBlockV10>,
    global_sender: &flume::Sender<GlobalBackGroundTaskMsg>,
) -> KvResult<BlockMetaV2> {
    let block_for_cm = Arc::clone(&block);
    let block_for_txs_mp = Arc::clone(&block);

    // Cm
    crate::cm::update_current_meta(&block_for_cm, &global_sender);

    //TxsMp
    let txs_mp_handle = dbs_pool
        .launch(move |dbs| {
            crate::txs_mp::apply_block(block_for_txs_mp.transactions(), &dbs.txs_mp_db)?;
            Ok::<_, KvError>(())
        })
        .expect("dbs pool disconnected");

    // Bc
    let new_current = crate::bc::apply_block(bc_db, &block)?;

    txs_mp_handle.join().expect("dbs pool disconnected")?;

    Ok(new_current)
}

fn apply_chunk_inner(
    bc_db: &BcV2Db<FileBackend>,
    dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<SharedDbs<FileBackend>>,
    blocks: Arc<[DubpBlockV10]>,
    global_sender: Option<&flume::Sender<GlobalBackGroundTaskMsg>>,
) -> KvResult<BlockMetaV2> {
    let blocks_len = blocks.len();
    let blocks_for_txs_mp = Arc::clone(&blocks);

    // Cm
    if let Some(global_sender) = global_sender {
        let chunk_len = blocks.len();
        crate::cm::update_current_meta(&&blocks.deref()[chunk_len - 1], &global_sender);
    }

    //TxsMp
    //log::info!("apply_chunk: launch txs_mp job...");
    let txs_mp_handle = dbs_pool
        .launch(move |dbs| {
            for block in blocks_for_txs_mp.deref() {
                crate::txs_mp::apply_block(block.transactions(), &dbs.txs_mp_db)?;
            }
            Ok::<_, KvError>(())
        })
        .expect("apply_chunk_inner:txs_mp: dbs pool disconnected");

    // Bc
    //log::info!("apply_chunk: launch bc job...");
    for block in &blocks[..(blocks_len - 1)] {
        crate::bc::apply_block(bc_db, block)?;
    }
    let current_block = crate::bc::apply_block(bc_db, &blocks[blocks_len - 1])?;

    txs_mp_handle
        .join()
        .expect("txs_mp_recv: dbs pool disconnected")?;
    //log::info!("apply_chunk: txs_mp job finish.");

    Ok(current_block)
}

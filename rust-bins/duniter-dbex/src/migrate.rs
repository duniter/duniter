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
use duniter_core::dbs::{databases::bc_v1::BcV1DbReadable, FileBackend};
use duniter_core::{
    block::parser::parse_json_block_from_serde_value, block::parser::ParseJsonBlockError,
    block::prelude::DubpBlockTrait, block::DubpBlock, common::prelude::BlockNumber,
};
use fast_threadpool::{ThreadPool, ThreadPoolConfig};
use std::{ops::Deref, path::PathBuf};

const CHUNK_SIZE: usize = 250;

pub(crate) fn migrate(profile_path: PathBuf) -> anyhow::Result<()> {
    let start_time = Instant::now();

    // Remove bc_db and gva_db
    std::fs::remove_dir_all(profile_path.join("data/bc_v2_sled"))?;
    std::fs::remove_dir_all(profile_path.join("data/gva_v1_sled"))?;

    // Open bc_db and gva_db
    let (bc_db, shared_dbs) = duniter_core::dbs::open_dbs(Some(profile_path.as_path()))?;
    let gva_db = duniter_gva_indexer::get_gva_db_rw(Some(profile_path.as_path()));

    if let Err(e) = migrate_inner(&bc_db, gva_db, profile_path, shared_dbs, start_time) {
        // Clear bc_db and gva_db
        bc_db.clear()?;
        gva_db.clear()?;

        Err(e)
    } else {
        Ok(())
    }
}

fn migrate_inner(
    bc_db: &BcV2Db<FileBackend>,
    gva_db: &'static GvaV1Db<FileBackend>,
    profile_path: PathBuf,
    shared_dbs: SharedDbs<FileBackend>,
    start_time: Instant,
) -> anyhow::Result<()> {
    let data_path = profile_path.join(crate::DATA_DIR);
    let duniter_js_db = BcV1Db::<LevelDb>::open(LevelDbConf {
        db_path: data_path.as_path().join("leveldb"),
        ..Default::default()
    })?;

    let dbs_pool = ThreadPool::start(ThreadPoolConfig::default(), shared_dbs).into_sync_handler();

    if let Some(target) = get_target_block_number(&duniter_js_db)? {
        println!("target block: #{}", target.0);

        let (s, r) = flume::unbounded();
        let reader_handle = std::thread::spawn(move || {
            duniter_js_db.main_blocks().iter(.., |it| {
                it.values().try_for_each(|block_res| {
                    s.send(block_res).map_err(|_| anyhow!("fail to send"))
                })
            })
        });
        let (s2, r2) = flume::unbounded();
        let parser_handle = std::thread::spawn(move || {
            let target_u64 = target.0 as u64;
            let mut db_blocks = Vec::with_capacity(CHUNK_SIZE);
            while let Ok(db_block_res) = r.recv() {
                let db_block = db_block_res?;
                let db_block_number = db_block.number;
                db_blocks.push(db_block);
                if db_blocks.len() == CHUNK_SIZE || db_block_number == target_u64 {
                    let blocks = std::mem::take(&mut db_blocks)
                        .into_par_iter()
                        .map(|db_block| match serde_json::to_value(&db_block) {
                            Ok(json_block) => {
                                match parse_json_block_from_serde_value(&json_block) {
                                    Ok(block) => match block {
                                        DubpBlock::V10(block_v10) => Ok(block_v10),
                                    },
                                    Err(e) => Err(anyhow::Error::new::<ParseJsonBlockError>(e)),
                                }
                            }
                            Err(e) => Err(anyhow::Error::new::<serde_json::Error>(e)),
                        })
                        .collect::<anyhow::Result<Vec<_>>>()?;
                    s2.send(blocks).map_err(|_| anyhow!("fail to send"))?;
                    db_blocks.reserve_exact(CHUNK_SIZE);
                }
            }
            Ok::<(), anyhow::Error>(())
        });

        let mut current = None;
        let mut currency_params = Default::default();
        while let Ok(chunk) = r2.recv() {
            if !chunk.is_empty() {
                println!(
                    "Apply chunk #{}-#{} ..",
                    chunk[0].number(),
                    chunk[chunk.len() - 1].number()
                );
                if let Some(currency_parameters) = chunk[0].currency_parameters() {
                    currency_params = currency_parameters;
                }
                let chunk = Arc::from(chunk);
                let chunk_arc_clone = Arc::clone(&chunk);
                let profile_path_clone = profile_path.clone();
                let gva_chunks_handle = dbs_pool
                    .launch(move |_| {
                        for block in chunk_arc_clone.deref() {
                            duniter_gva_indexer::apply_block_blocks_chunk(
                                block,
                                gva_db,
                                &profile_path_clone,
                            )?;
                        }
                        Ok::<_, KvError>(())
                    })
                    .expect("gva:apply_chunk: dbs pool disconnected");
                let chunk_arc_clone = Arc::clone(&chunk);
                let gva_handle = dbs_pool
                    .launch(move |_| {
                        for block in chunk_arc_clone.deref() {
                            duniter_gva_indexer::apply_block(block, currency_params, gva_db)?;
                        }
                        Ok::<_, KvError>(())
                    })
                    .expect("gva:apply_chunk: dbs pool disconnected");
                current = Some(duniter_core::dbs_write_ops::apply_block::apply_chunk(
                    bc_db, current, &dbs_pool, chunk, None,
                )?);
                gva_chunks_handle
                    .join()
                    .expect("gva:apply_block_blocks_chunk: dbs pool disconnected")?;
                gva_handle
                    .join()
                    .expect("gva:apply_chunk: dbs pool disconnected")?;
            }
        }

        reader_handle.join().expect("reader thread panic")?;
        parser_handle.join().expect("parser thread panic")?;

        println!("Flush DBs caches on disk...");
        bc_db.save()?;
        gva_db.save()?;

        if let Some(current) = current {
            if current.number != target.0 {
                Err(anyhow::anyhow!("Migration fail: current != target"))
            } else {
                let duration = start_time.elapsed();
                println!(
                    "Migration successfully completed on {} seconds.",
                    duration.as_secs()
                );
                Ok(())
            }
        } else {
            Err(anyhow::anyhow!("Migration fail: rust dbs are empty"))
        }
    } else {
        Err(anyhow::anyhow!("Empty blockchain"))
    }
}

fn get_target_block_number(duniter_js_db: &BcV1Db<LevelDb>) -> KvResult<Option<BlockNumber>> {
    duniter_js_db.main_blocks().iter_rev(.., |it| {
        it.keys().map(|k_res| k_res.map(|bn| bn.0)).next_res()
    })
}

/*fn get_chunk(duniter_js_db: &BcV1Db<LevelDb>, i: u32) -> anyhow::Result<Vec<DubpBlockV10>> {
    let start = BlockNumberKeyV1(BlockNumber(i * CHUNK_SIZE));
    let end = BlockNumberKeyV1(BlockNumber(((i + 1) * CHUNK_SIZE) - 1));
    println!("get_chunk({}): range {}..{}", i, start.0, end.0);
    let db_blocks = duniter_js_db
        .main_blocks()
        .iter(start..=end, |it| it.values().collect::<KvResult<Vec<_>>>())?;

    db_blocks
        .into_par_iter()
        .map(|db_block| match serde_json::to_value(&db_block) {
            Ok(json_block) => match parse_json_block_from_serde_value(&json_block) {
                Ok(block) => match block {
                    DubpBlock::V10(block_v10) => Ok(block_v10),
                },
                Err(e) => Err(anyhow::Error::new::<ParseJsonBlockError>(e)),
            },
            Err(e) => Err(anyhow::Error::new::<serde_json::Error>(e)),
        })
        .collect()
}
*/

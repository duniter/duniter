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
use duniter_core::dbs::{
    databases::bc_v1::{BcV1Db, BcV1DbReadable},
    kv_typed::prelude::Backend,
};
use fast_threadpool::{ThreadPool, ThreadPoolConfig};
use once_cell::sync::OnceCell;
use std::{
    io::BufWriter,
    path::{Path, PathBuf},
};
use termprogress::prelude::*;

static OUTPUT_DIR: OnceCell<PathBuf> = OnceCell::new();

pub(crate) fn export_bc<B: Backend>(
    bc_v1: BcV1Db<B>,
    chunk_size: usize,
    output_dir: PathBuf,
    pretty: bool,
) -> anyhow::Result<()> {
    if !output_dir.exists() {
        std::fs::create_dir_all(output_dir.clone())?;
    }
    let output_dir: &'static Path = OUTPUT_DIR.get_or_init(|| output_dir).as_path();

    if let Some(last_block) = bc_v1
        .main_blocks()
        .iter_rev(.., |it| it.keys().next_res())?
    {
        let mut chunks_count = (last_block.0).0 as usize / chunk_size;
        if (last_block.0).0 as usize % chunk_size > 0 {
            chunks_count += 1;
        }
        let chunks_count = chunks_count as f64;
        let mut progress_bar = Bar::default();

        let start_time = Instant::now();

        let (s, r) = flume::unbounded();
        let reader_handle = std::thread::spawn(move || {
            bc_v1.main_blocks().iter(.., |it| {
                it.values().try_for_each(|block_res| {
                    s.send(block_res).map_err(|_| anyhow!("fail to send"))
                })
            })
        });

        let (s2, r2) = flume::unbounded();
        let jsonifier_handle = std::thread::spawn(move || {
            r.iter().try_for_each(|block_res| {
                let json_block_res = match block_res {
                    Ok(block) => match serde_json::to_value(&block) {
                        Ok(serde_json::Value::Object(mut block_json)) => {
                            block_json.remove("UDTime");
                            block_json.remove("fork");
                            block_json.remove("wrong");
                            block_json.remove("written_on");
                            block_json.remove("writtenOn");

                            // Remove field `transactions.hash`
                            if let Some(serde_json::Value::Array(txs_json)) =
                                block_json.get_mut("transactions")
                            {
                                for tx_json in txs_json {
                                    if let serde_json::Value::Object(tx_json) = tx_json {
                                        tx_json.remove("hash");
                                    }
                                }
                            }
                            Ok(serde_json::Value::Object(block_json))
                        }
                        Err(e) => Err(KvError::DeserError(e.into())),
                        Ok(_) => unreachable!(),
                    },
                    Err(e) => Err(e),
                };
                s2.send(json_block_res).map_err(|_| anyhow!("fail to send"))
            })
        });

        let threadpool = ThreadPool::start(ThreadPoolConfig::default(), ()).into_sync_handler();

        let mut chunk_index = 0;
        let mut json_blocks = Vec::with_capacity(chunk_size);
        let mut writers_handle = Vec::with_capacity(500_000 / chunk_size);
        r2.into_iter()
            .try_for_each::<_, anyhow::Result<()>>(|json_block_res| {
                let json_block = json_block_res?;
                json_blocks.push(json_block);
                if json_blocks.len() == chunk_size {
                    let chunk = std::mem::take(&mut json_blocks);
                    json_blocks.reserve_exact(chunk_size);
                    // Write chunk "asynchronously"
                    writers_handle.push(threadpool.launch(move |_| {
                        write_chunk(chunk, chunk_index, chunk_size, output_dir, pretty)
                    })?);
                    chunk_index += 1;
                    if chunk_index % 8 == 0 {
                        progress_bar.set_progress(chunk_index as f64 / chunks_count);
                    }
                }
                Ok(())
            })?;
        // Write last chunk
        if !json_blocks.is_empty() {
            write_chunk(json_blocks, chunk_index, chunk_size, output_dir, pretty)?;
        }
        progress_bar.set_progress(1.0);

        reader_handle
            .join()
            .map_err(|_| anyhow!("reader panic"))??;
        jsonifier_handle
            .join()
            .map_err(|_| anyhow!("jsonnifier panic"))??;
        for writer_handle in writers_handle {
            writer_handle.join()??;
        }

        progress_bar.complete();

        let duration = start_time.elapsed();
        println!(
            "Blockchain successfully exported in {}.{} seconds.",
            duration.as_secs(),
            duration.subsec_millis()
        );
        Ok(())
    } else {
        Err(anyhow!("no blockchain"))
    }
}

fn write_chunk(
    chunk: Vec<serde_json::Value>,
    chunk_index: usize,
    chunk_size: usize,
    output_dir: &'static Path,
    pretty: bool,
) -> anyhow::Result<()> {
    let mut object_json = serde_json::Map::new();
    object_json.insert("blocks".to_owned(), serde_json::Value::Array(chunk));
    let chunk_json = serde_json::Value::Object(object_json);

    let file = File::create(output_dir.join(format!("chunk_{}-{}.json", chunk_index, chunk_size)))?;

    let mut buffer = BufWriter::new(file);
    if pretty {
        serde_json::to_writer_pretty(&mut buffer, &chunk_json)?;
    } else {
        serde_json::to_writer(&mut buffer, &chunk_json)?;
    }
    buffer.flush()?;

    Ok(())
}

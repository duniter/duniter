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

#![deny(
    clippy::unwrap_used,
    missing_copy_implementations,
    trivial_casts,
    trivial_numeric_casts,
    unstable_features,
    unused_import_braces
)]

mod cli;
mod export_bc;
mod migrate;
mod print_found_data;
mod stringify_json_value;

use self::cli::{Database, Opt, OutputFormat, SubCommand};
use self::stringify_json_value::stringify_json_value;
use anyhow::anyhow;
use comfy_table::Table;
use duniter_dbs::databases::{
    bc_v1::{BcV1Db, BcV1DbWritable},
    bc_v2::{BcV2Db, BcV2DbWritable},
    dunp_v1::{DunpV1Db, DunpV1DbWritable},
    gva_v1::{GvaV1Db, GvaV1DbWritable},
    txs_mp_v2::{TxsMpV2Db, TxsMpV2DbWritable},
};
use duniter_dbs::kv_typed::prelude::*;
use duniter_dbs::prelude::*;
use duniter_dbs::regex::Regex;
use duniter_dbs::serde_json::{Map, Value};
use duniter_dbs::smallvec::{smallvec, SmallVec};
use rayon::prelude::*;
use std::{
    collections::{HashMap, HashSet},
    fs::File,
    io::{stdin, Write},
    iter::FromIterator,
    time::Instant,
};
use structopt::StructOpt;

const DATA_DIR: &str = "data";
const TOO_MANY_ENTRIES_ALERT: usize = 5_000;

fn main() -> anyhow::Result<()> {
    let opt = Opt::from_args();

    let home = if let Some(home) = opt.home {
        home
    } else {
        dirs::config_dir()
            .ok_or_else(|| {
                anyhow!("Fail to auto find duniter's home directory, please specify it explicitly.")
            })?
            .as_path()
            .join("duniter")
    };

    let profile_name = if let Some(profile_name) = opt.profile {
        profile_name
    } else {
        "duniter_default".to_owned()
    };

    let profile_path = home.as_path().join(&profile_name);
    let data_path = profile_path.as_path().join(DATA_DIR);

    if !data_path.exists() {
        return Err(anyhow!(
            "Path '{}' don't exist !",
            data_path.to_str().expect("non-UTF-8 strings not supported")
        ));
    }

    match opt.cmd {
        SubCommand::Migrate => migrate::migrate(profile_path),
        SubCommand::ExportBc {
            chunk_size,
            output_dir,
            pretty,
        } => export_bc::export_bc(
            BcV1Db::<LevelDb>::open(LevelDbConf {
                db_path: data_path.as_path().join("leveldb"),
                ..Default::default()
            })?,
            chunk_size,
            output_dir,
            pretty,
        ),
        _ => {
            let open_db_start_time = Instant::now();
            match opt.database {
                Database::BcV1 => apply_subcommand(
                    BcV1Db::<LevelDb>::open(LevelDbConf {
                        db_path: data_path.as_path().join("leveldb"),
                        ..Default::default()
                    })?,
                    opt.cmd,
                    open_db_start_time,
                ),
                Database::BcV2 => apply_subcommand(
                    BcV2Db::<Sled>::open(Sled::gen_backend_conf(
                        BcV2Db::<Sled>::NAME,
                        Some(profile_path.as_path()),
                    ))?,
                    opt.cmd,
                    open_db_start_time,
                ),
                Database::DunpV1 => apply_subcommand(
                    DunpV1Db::<Sled>::open(Sled::gen_backend_conf(
                        DunpV1Db::<Sled>::NAME,
                        Some(profile_path.as_path()),
                    ))?,
                    opt.cmd,
                    open_db_start_time,
                ),
                Database::GvaV1 => apply_subcommand(
                    GvaV1Db::<Sled>::open(Sled::gen_backend_conf(
                        GvaV1Db::<Sled>::NAME,
                        Some(profile_path.as_path()),
                    ))?,
                    opt.cmd,
                    open_db_start_time,
                ),
                Database::TxsMpV2 => apply_subcommand(
                    TxsMpV2Db::<Sled>::open(Sled::gen_backend_conf(
                        TxsMpV2Db::<Sled>::NAME,
                        Some(profile_path.as_path()),
                    ))?,
                    opt.cmd,
                    open_db_start_time,
                ),
            }
        }
    }
}

fn apply_subcommand<DB: DbExplorable>(
    db: DB,
    cmd: SubCommand,
    open_db_start_time: Instant,
) -> anyhow::Result<()> {
    let duration = open_db_start_time.elapsed();
    println!(
        "Database opened in {}.{:06} seconds.",
        duration.as_secs(),
        duration.subsec_micros()
    );
    let start_time = Instant::now();

    match cmd {
        SubCommand::Count { collection } => {
            if let ExplorerActionResponse::Count(count) =
                db.explore(&collection, ExplorerAction::Count, stringify_json_value)??
            {
                let duration = start_time.elapsed();
                println!(
                    "Count operation performed in {}.{:06} seconds.",
                    duration.as_secs(),
                    duration.subsec_micros()
                );
                println!("\nThis collection contains {} entries.", count);
            }
        }
        SubCommand::Get { collection, key } => {
            if let ExplorerActionResponse::Get(value_opt) = db.explore(
                &collection,
                ExplorerAction::Get { key: &key },
                stringify_json_value,
            )?? {
                if let Some(value) = value_opt {
                    println!("\n{}", value)
                } else {
                    println!("\nThis collection not contains this key.")
                }
            }
        }
        SubCommand::Find {
            collection,
            start,
            end,
            key_regex,
            keys_only,
            value_regex,
            limit,
            reverse,
            properties,
            output: output_format,
            pretty: pretty_json,
            file: output_file,
            step,
        } => {
            let value_regex_opt = opt_string_to_res_opt_regex(value_regex)?;
            let captures_headers = if let Some(ref value_regex) = value_regex_opt {
                value_regex
                    .capture_names()
                    .skip(1)
                    .enumerate()
                    .map(|(i, name_opt)| {
                        if let Some(name) = name_opt {
                            name.to_owned()
                        } else {
                            format!("CAP{}", i + 1)
                        }
                    })
                    .collect()
            } else {
                vec![]
            };
            if let ExplorerActionResponse::Find(entries) = db.explore(
                &collection,
                ExplorerAction::Find {
                    key_min: start,
                    key_max: end,
                    key_regex: opt_string_to_res_opt_regex(key_regex)?,
                    value_regex: value_regex_opt,
                    limit,
                    reverse,
                    step,
                },
                stringify_json_value,
            )?? {
                let duration = start_time.elapsed();
                println!(
                    "Search performed in {}.{:06} seconds.\n\n{} entries found.",
                    duration.as_secs(),
                    duration.subsec_micros(),
                    entries.len()
                );

                if !too_many_entries(entries.len(), output_file.is_none())? {
                    return Ok(());
                }

                let start_print = Instant::now();
                if let Some(output_file) = output_file {
                    let mut file = File::create(output_file.as_path())?;

                    //let mut file_buffer = BufWriter::new(file);
                    print_found_data::print_found_data(
                        &mut file,
                        output_format,
                        pretty_json,
                        false,
                        print_found_data::DataToShow {
                            entries,
                            keys_only,
                            only_properties: properties,
                        },
                        captures_headers,
                    )?;
                    //file_buffer.flush().map_err(|e| format!("{}", e))?;

                    let export_duration = start_print.elapsed();
                    println!(
                        "Search results were written to file: '{}' in {}.{:06} seconds.",
                        output_file
                            .to_str()
                            .expect("output-file contains invalid utf8 characters"),
                        export_duration.as_secs(),
                        export_duration.subsec_micros(),
                    );
                } else {
                    print_found_data::print_found_data(
                        &mut std::io::stdout(),
                        output_format,
                        pretty_json,
                        true,
                        print_found_data::DataToShow {
                            entries,
                            keys_only,
                            only_properties: properties,
                        },
                        captures_headers,
                    )?;
                    let print_duration = start_print.elapsed();
                    println!(
                        "Search results were displayed in {}.{:06} seconds.",
                        print_duration.as_secs(),
                        print_duration.subsec_micros(),
                    );
                };
            }
        }
        SubCommand::Schema => {
            show_db_schema(DB::list_collections());
        }
        _ => unreachable!(),
    };

    Ok(())
}

fn too_many_entries(entries_len: usize, output_in_term: bool) -> std::io::Result<bool> {
    if entries_len > TOO_MANY_ENTRIES_ALERT {
        println!(
            "{} all {} entries ? (Be careful, may crash your system!) [y/N]",
            if output_in_term { "Display" } else { "Export" },
            entries_len
        );
        let mut buffer = String::new();
        stdin().read_line(&mut buffer)?;
        Ok(buffer == "y\n")
    } else {
        Ok(true)
    }
}

fn show_db_schema(collections_names: Vec<(&'static str, &'static str, &'static str)>) {
    let mut table = Table::new();
    table.set_content_arrangement(comfy_table::ContentArrangement::Dynamic);
    table.set_header(&["Collection name", "Key type", "Value type"]);
    for (collection_name, key_full_type_name, value_full_type_name) in collections_names {
        let key_type_name_opt = key_full_type_name.split(':').last();
        let value_type_name_opt = value_full_type_name.split(':').last();
        table.add_row(&[
            collection_name,
            key_type_name_opt.unwrap_or("?"),
            value_type_name_opt.unwrap_or("?"),
        ]);
    }
    println!("{}", table);
}

#[inline]
fn opt_string_to_res_opt_regex(str_regex_opt: Option<String>) -> anyhow::Result<Option<Regex>> {
    if let Some(str_regex) = str_regex_opt {
        Ok(Some(Regex::new(&str_regex)?))
    } else {
        Ok(None)
    }
}

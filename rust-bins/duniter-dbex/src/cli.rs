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

use std::{num::NonZeroUsize, path::PathBuf, str::FromStr};
use structopt::StructOpt;

#[derive(Debug, StructOpt)]
#[structopt(name = "duniter-dbex", about = "Duniter databases explorer.")]
pub struct Opt {
    /// Duniter profile name
    #[structopt(short, long)]
    pub profile: Option<String>,

    /// Duniter home directory
    #[structopt(short, long, parse(from_os_str))]
    pub home: Option<PathBuf>,

    /// database
    #[structopt(default_value = "bc_v1", possible_values = &["bc_v1", "bc_v2", "gva_v1", "txs_mp_v2"])]
    pub database: Database,

    #[structopt(subcommand)]
    pub cmd: SubCommand,
}

#[derive(Debug)]
pub enum Database {
    BcV1,
    BcV2,
    GvaV1,
    TxsMpV2,
}

impl FromStr for Database {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "bc_v1" => Ok(Self::BcV1),
            "bc_v2" => Ok(Self::BcV2),
            "gva_v1" => Ok(Self::GvaV1),
            "txs_mp_v2" => Ok(Self::TxsMpV2),
            _ => unreachable!(),
        }
    }
}

#[derive(Debug, StructOpt)]
pub enum SubCommand {
    /// Count collection entries
    Count { collection: String },
    /// Get one value
    Get { collection: String, key: String },
    /// Search values by criteria
    Find {
        collection: String,
        #[structopt(short, long)]
        /// Key min
        start: Option<String>,
        #[structopt(short, long)]
        /// Key max
        end: Option<String>,
        /// Filter keys by a regular expression
        #[structopt(short = "k", long)]
        key_regex: Option<String>,
        /// Show keys only
        #[structopt(long)]
        keys_only: bool,
        /// Filter values by a regular expression
        #[structopt(short = "v", long)]
        value_regex: Option<String>,
        /// Maximum number of entries to be found (Slower because force sequential search)
        #[structopt(short, long)]
        limit: Option<usize>,
        /// Browse the collection upside down
        #[structopt(short, long)]
        reverse: bool,
        /// Step by
        #[structopt(long, default_value = "1")]
        step: NonZeroUsize,
        /// Output format
        #[structopt(short, long, default_value = "table-json", possible_values = &["csv", "json", "table-json", "table-properties"])]
        output: OutputFormat,
        /// Pretty json (Only for output format json or table-json)
        #[structopt(long)]
        pretty: bool,
        /// Show only the specified properties
        #[structopt(short, long)]
        properties: Vec<String>,
        /// Export found data to a file
        #[structopt(short, long, parse(from_os_str))]
        file: Option<PathBuf>,
    },
    /// Show database schema
    Schema,
    /// Fill rust dbs from js db content
    Migrate,
}

#[derive(Clone, Copy, Debug)]
pub enum OutputFormat {
    Table,
    TableJson,
    Json,
    Csv,
}

impl FromStr for OutputFormat {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "csv" => Ok(Self::Csv),
            "json" => Ok(Self::Json),
            "table-properties" => Ok(Self::Table),
            "table-json" => Ok(Self::TableJson),
            _ => unreachable!(),
        }
    }
}

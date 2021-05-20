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

use duniter_core::wot::data::rusty::RustyWebOfTrust;
use flate2::read::ZlibDecoder;
use std::convert::TryFrom;
use std::fs::File;
use std::io::prelude::*;
use std::path::{Path, PathBuf};

pub(crate) fn wot_from_file(file_path_str: String) -> Result<RustyWebOfTrust, String> {
    let file_path = PathBuf::try_from(&file_path_str).map_err(|e| format!("{}", e))?;
    if file_path_str.ends_with(".gz") {
        let bytes = read_and_decompress_bytes_from_file(file_path.as_path())
            .map_err(|e| format!("{}", e))?;
        if bytes.is_empty() {
            Ok(RustyWebOfTrust::default())
        } else {
            Ok(bincode::deserialize::<RustyWebOfTrust>(&bytes).map_err(|e| format!("{}", e))?)
        }
    } else {
        Err("invalid wot file format.".to_owned())
    }
}

/// Read and decompress bytes from file
fn read_and_decompress_bytes_from_file(file_path: &Path) -> Result<Vec<u8>, std::io::Error> {
    if !file_path.exists() {
        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent)?
        }
        File::create(file_path)?;
    }
    if std::fs::metadata(file_path)?.len() > 0 {
        let file = File::open(file_path)?;
        let mut z = ZlibDecoder::new(file);
        let mut decompressed_bytes = Vec::new();
        z.read_to_end(&mut decompressed_bytes)?;

        Ok(decompressed_bytes)
    } else {
        Ok(vec![])
    }
}

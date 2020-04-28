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

use dubp_wot::data::rusty::RustyWebOfTrust;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use std::convert::TryFrom;
use std::fs::File;
use std::io::prelude::*;
use std::path::{Path, PathBuf};

pub(crate) fn wot_in_file(file_path_str: String, wot: &RustyWebOfTrust) -> Result<(), String> {
    let file_path = PathBuf::try_from(file_path_str).map_err(|e| format!("{}", e))?;
    let bytes = bincode::serialize(wot).map_err(|e| format!("{}", e))?;

    write_and_compress_bytes_in_file(file_path.as_path(), &bytes, flate2::Compression::default())
        .map_err(|e| format!("{}", e))?;

    Ok(())
}

/// Write and compress bytes in file
pub(crate) fn write_and_compress_bytes_in_file(
    file_path: &Path,
    datas: &[u8],
    compression: Compression,
) -> Result<(), std::io::Error> {
    let file = File::create(file_path)?;
    let mut e = ZlibEncoder::new(file, compression);
    e.write_all(&datas[..])?;
    e.finish()?;

    Ok(())
}

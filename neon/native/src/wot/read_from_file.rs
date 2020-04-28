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

use dubp_wot::data::{rusty::RustyWebOfTrust, WebOfTrust, WotId};
use flate2::read::ZlibDecoder;
use std::convert::TryFrom;
use std::fs::File;
use std::io::prelude::*;
use std::io::BufReader;
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
        let bytes = read_bytes_from_file(file_path.as_path()).map_err(|e| format!("{}", e))?;
        from_cpp_wot(&bytes)
    }
}

/// Read bytes from file
fn read_bytes_from_file(file_path: &Path) -> Result<Vec<u8>, std::io::Error> {
    let file = File::open(file_path)?;

    let mut buf_reader = BufReader::new(file);

    let mut decompressed_bytes = Vec::new();
    buf_reader.read_to_end(&mut decompressed_bytes)?;

    Ok(decompressed_bytes)
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

fn from_cpp_wot(bytes: &[u8]) -> Result<RustyWebOfTrust, String> {
    if bytes.len() < 8 {
        return Err("wot file is corrupted".to_owned());
    }

    let mut buffer = [0u8; 4];
    let mut cursor = 0;

    // Read max_links and create empty wot
    buffer.copy_from_slice(&bytes[cursor..cursor + 4]);
    cursor += 4;
    let max_links = u32::from_le_bytes(buffer);
    let mut wot = RustyWebOfTrust::new(max_links as usize);

    // Read nodes count
    buffer.copy_from_slice(&bytes[cursor..cursor + 4]);
    cursor += 4;
    let nodes_count = u32::from_le_bytes(buffer);

    for _ in 0..nodes_count {
        let wot_id = wot.add_node();

        // Read enabled
        let enabled = bytes[cursor];
        cursor += 1;
        if enabled == 0 {
            wot.set_enabled(wot_id, false);
        }

        // Read certs_count
        buffer.copy_from_slice(&bytes[cursor..cursor + 4]);
        cursor += 4;
        let certs_count = u32::from_le_bytes(buffer);

        // Read certs
        for _ in 0..certs_count {
            buffer.copy_from_slice(&bytes[cursor..cursor + 4]);
            cursor += 4;
            let cert_source = WotId(u32::from_le_bytes(buffer) as usize);
            wot.add_link(cert_source, wot_id);
        }
    }

    Ok(wot)
}

#[cfg(test)]
mod tests {

    use super::*;
    use dubp_wot::data::HasLinkResult;

    #[test]
    fn test_from_cpp_wot() -> Result<(), std::io::Error> {
        let bytes = read_bytes_from_file(PathBuf::from("tests/wotb.bin").as_path())?;

        let wot = from_cpp_wot(&bytes).expect("fail to read cpp wot");

        assert_eq!(wot.get_max_link(), 100);
        assert_eq!(wot.size(), 3394);
        assert_eq!(
            wot.has_link(WotId(33), WotId(35)),
            HasLinkResult::Link(true),
        );

        Ok(())
    }
}

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

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, PartialOrd, Serialize)]
pub struct SourceKeyV1 {
    pub tx_hash: Hash,
    pub pos: u32,
    pub consumed: Option<bool>,
}

impl ToString for SourceKeyV1 {
    fn to_string(&self) -> String {
        format!(
            "{}-{:010}{}",
            self.tx_hash,
            self.pos,
            match self.consumed {
                Some(true) => "-1",
                Some(false) => "-0",
                None => "",
            }
        )
    }
}

impl AsBytes for SourceKeyV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        f(self.to_string().as_bytes())
    }
}

impl kv_typed::prelude::FromBytes for SourceKeyV1 {
    type Err = CorruptedBytes;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let strs: ArrayVec<[&str; 3]> = std::str::from_utf8(bytes)
            .map_err(|e| CorruptedBytes(e.to_string()))?
            .split('-')
            .collect();
        let tx_hash = Hash::from_hex(strs[0]).map_err(|e| CorruptedBytes(e.to_string()))?;
        let pos = strs[1]
            .parse()
            .map_err(|e: ParseIntError| CorruptedBytes(e.to_string()))?;
        let consumed = if strs.len() <= 2 {
            None
        } else {
            match strs[2] {
                "1" => Some(true),
                "0" => Some(false),
                _ => {
                    return Err(CorruptedBytes(
                        "invalid format: field consumed must be encoded with '0' or '1'".to_owned(),
                    ))
                }
            }
        };
        Ok(SourceKeyV1 {
            tx_hash,
            pos,
            consumed,
        })
    }
}

impl ToDumpString for SourceKeyV1 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableKey for SourceKeyV1 {
    fn from_explorer_str(source: &str) -> Result<Self, FromExplorerKeyErr> {
        Self::from_bytes(source.as_bytes()).map_err(|e| FromExplorerKeyErr(e.0.into()))
    }
    fn to_explorer_string(&self) -> KvResult<String> {
        self.as_bytes(|bytes| Ok(unsafe { std::str::from_utf8_unchecked(bytes) }.to_owned()))
    }
}

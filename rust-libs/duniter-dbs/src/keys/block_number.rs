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

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, PartialOrd)]
pub struct BlockNumberKeyV1(pub BlockNumber);

impl KeyAsBytes for BlockNumberKeyV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        if self.0 == BlockNumber(u32::MAX) {
            f(b"0000000NaN")
        } else {
            f(format!("{:010}", (self.0).0).as_bytes())
        }
    }
}

impl FromBytes for BlockNumberKeyV1 {
    type Err = CorruptedBytes;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let key_str = std::str::from_utf8(bytes).map_err(|e| CorruptedBytes(e.to_string()))?;
        if key_str == "0000000NaN" {
            Ok(BlockNumberKeyV1(BlockNumber(u32::MAX)))
        } else {
            Ok(BlockNumberKeyV1(BlockNumber(key_str.parse().map_err(
                |e| CorruptedBytes(format!("{}: {}", e, key_str)),
            )?)))
        }
    }
}

impl ToDumpString for BlockNumberKeyV1 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableKey for BlockNumberKeyV1 {
    fn from_explorer_str(source: &str) -> Result<Self, FromExplorerKeyErr> {
        Self::from_bytes(source.as_bytes()).map_err(|e| FromExplorerKeyErr(e.0.into()))
    }
    fn to_explorer_string(&self) -> KvResult<String> {
        Ok(format!("{}", (self.0).0))
    }
}

#[cfg(test)]
mod tests {

    use super::*;

    #[test]
    fn test_block_number_str_10_ser() {
        BlockNumberKeyV1(BlockNumber(35))
            .as_bytes(|bytes| assert_eq!(bytes, &[48, 48, 48, 48, 48, 48, 48, 48, 51, 53]))
    }
}

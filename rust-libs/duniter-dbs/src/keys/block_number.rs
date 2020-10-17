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
    type Err = StringErr;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let key_str = std::str::from_utf8(bytes).map_err(|e| StringErr(format!("{}", e)))?;
        if key_str == "0000000NaN" {
            Ok(BlockNumberKeyV1(BlockNumber(u32::MAX)))
        } else {
            Ok(BlockNumberKeyV1(BlockNumber(
                key_str
                    .parse()
                    .map_err(|e| StringErr(format!("{}: {}", e, key_str)))?,
            )))
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
    fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
        Self::from_bytes(source.as_bytes())
    }
    fn to_explorer_string(&self) -> KvResult<String> {
        Ok(format!("{}", (self.0).0))
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, PartialOrd)]
#[repr(transparent)]
pub struct BlockNumberKeyV2(pub BlockNumber);

impl KeyAsBytes for BlockNumberKeyV2 {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        f(&(self.0).0.to_be_bytes()[..])
    }
}

impl FromBytes for BlockNumberKeyV2 {
    type Err = StringErr;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        Ok(Self(BlockNumber(
            zerocopy::LayoutVerified::<_, zerocopy::U32<byteorder::BigEndian>>::new(bytes)
                .ok_or_else(|| {
                    StringErr(
                        "Corrupted DB: BlockNumber bytes are invalid length or unaligned"
                            .to_owned(),
                    )
                })?
                .get(),
        )))
    }
}

impl ToDumpString for BlockNumberKeyV2 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableKey for BlockNumberKeyV2 {
    fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
        Ok(Self(
            BlockNumber::from_str(source).map_err(|e| StringErr(format!("{}", e)))?,
        ))
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

    #[test]
    fn block_number_key_v2() {
        let k = BlockNumberKeyV2(BlockNumber(3));
        k.as_bytes(|bytes| {
            assert_eq!(bytes, &[0, 0, 0, 3]);
        });
    }
}

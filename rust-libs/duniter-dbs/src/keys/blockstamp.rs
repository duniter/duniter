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
pub struct BlockstampKeyV1(Blockstamp);

impl KeyAsBytes for BlockstampKeyV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        f(format!("{:010}-{}", self.0.number.0, self.0.hash).as_bytes())
    }
}

impl kv_typed::prelude::FromBytes for BlockstampKeyV1 {
    type Err = StringErr;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let blockstamp_strs: ArrayVec<[&str; 2]> = std::str::from_utf8(bytes)
            .map_err(|e| StringErr(format!("{}", e)))?
            .split('-')
            .collect();
        let block_number = blockstamp_strs[0]
            .parse()
            .map_err(|e| StringErr(format!("{}", e)))?;
        let block_hash =
            Hash::from_hex(blockstamp_strs[1]).map_err(|e| StringErr(format!("{}", e)))?;
        Ok(BlockstampKeyV1(Blockstamp {
            number: BlockNumber(block_number),
            hash: BlockHash(block_hash),
        }))
    }
}

impl ToDumpString for BlockstampKeyV1 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableKey for BlockstampKeyV1 {
    fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
        Self::from_bytes(source.as_bytes())
    }
    fn to_explorer_string(&self) -> KvResult<String> {
        Ok(format!("{}", self.0))
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, PartialOrd)]
pub struct BlockstampKeyV2(Blockstamp);

impl KeyAsBytes for BlockstampKeyV2 {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        let bytes: [u8; 36] = self.0.into();
        f(&bytes[..])
    }
}

impl kv_typed::prelude::FromBytes for BlockstampKeyV2 {
    type Err = StringErr;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        use dubp::common::bytes_traits::FromBytes as _;
        Ok(Self(
            Blockstamp::from_bytes(bytes).map_err(|e| StringErr(e.to_string()))?,
        ))
    }
}

impl ToDumpString for BlockstampKeyV2 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableKey for BlockstampKeyV2 {
    fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
        Ok(Self(
            Blockstamp::from_str(source).map_err(|e| StringErr(e.to_string()))?,
        ))
    }
    fn to_explorer_string(&self) -> KvResult<String> {
        Ok(format!("{}", self.0))
    }
}

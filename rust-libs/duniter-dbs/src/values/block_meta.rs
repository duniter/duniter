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

use dubp::block::DubpBlockV10;

use crate::*;

const BLOCK_META_SERIALIZED_SIZE: usize = 323;

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
pub struct BlockMetaV2 {
    pub version: u64,                   // 8
    pub number: u32,                    // 4
    pub hash: Hash,                     // 32
    pub signature: Signature,           // 64
    pub inner_hash: Hash,               // 32
    pub previous_hash: Hash,            // 32
    pub issuer: PublicKey,              // 33
    pub previous_issuer: PublicKey,     // 33
    pub time: u64,                      // 8
    pub pow_min: u32,                   // 4
    pub members_count: u64,             // 8
    pub issuers_count: u32,             // 4
    pub issuers_frame: u64,             // 8
    pub issuers_frame_var: i64,         // 8
    pub median_time: u64,               // 8
    pub nonce: u64,                     // 8
    pub monetary_mass: u64,             // 8
    pub unit_base: u32,                 // 4
    pub dividend: Option<SourceAmount>, // 17 -> TOTAL SIZE == 335 bytes
}
impl BlockMetaV2 {
    pub fn blockstamp(&self) -> Blockstamp {
        Blockstamp {
            number: BlockNumber(self.number),
            hash: BlockHash(self.hash),
        }
    }
}

impl AsBytes for BlockMetaV2 {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        let mut buffer = [0u8; BLOCK_META_SERIALIZED_SIZE];
        bincode::serialize_into(&mut buffer[..], self).unwrap_or_else(|_| unreachable!());
        f(buffer.as_ref())
    }
}

impl kv_typed::prelude::FromBytes for BlockMetaV2 {
    type Err = bincode::Error;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        bincode::deserialize(bytes)
    }
}

impl ToDumpString for BlockMetaV2 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for BlockMetaV2 {
    fn from_explorer_str(json_str: &str) -> std::result::Result<Self, FromExplorerValueErr> {
        serde_json::from_str(&json_str)
            .map_err(|e| FromExplorerValueErr(format!("{}: '{}'", e, json_str).into()))
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        serde_json::to_value(self).map_err(|e| KvError::DeserError(e.into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use unwrap::unwrap;

    #[test]
    fn block_meta_v2_as_bytes() {
        assert_eq!(
            unwrap!(bincode::serialized_size(&BlockMetaV2 {
                dividend: Some(SourceAmount::new(42, 0)),
                ..Default::default()
            })),
            BLOCK_META_SERIALIZED_SIZE as u64
        );
        let bloc_meta = BlockMetaV2::default();

        let bm2_res = bloc_meta.as_bytes(|bytes| unwrap!(BlockMetaV2::from_bytes(bytes)));

        assert_eq!(bm2_res, bloc_meta);
    }
}

impl From<&DubpBlockV10> for BlockMetaV2 {
    fn from(block: &DubpBlockV10) -> Self {
        use dubp::block::prelude::DubpBlockTrait;
        BlockMetaV2 {
            version: 10,
            number: block.number().0,
            hash: block.hash().0,
            signature: block.signature(),
            inner_hash: block.inner_hash(),
            previous_hash: block.previous_hash(),
            issuer: block.issuer(),
            previous_issuer: PublicKey::default(),
            time: block.local_time(),
            pow_min: block.pow_min() as u32,
            members_count: block.members_count() as u64,
            issuers_count: block.issuers_count() as u32,
            issuers_frame: block.issuers_frame() as u64,
            issuers_frame_var: 0,
            median_time: block.common_time(),
            nonce: block.nonce(),
            monetary_mass: block.monetary_mass(),
            dividend: block.dividend(),
            unit_base: block.unit_base() as u32,
        }
    }
}

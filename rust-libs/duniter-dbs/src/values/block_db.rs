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

#[derive(Debug)]
pub enum BlockDbEnum {
    BlockDbV1(BlockDbV1),
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockDbV1 {
    pub version: u64,
    pub number: u64,
    pub currency: String,
    pub hash: String,
    pub signature: String,
    #[serde(rename = "inner_hash")]
    pub inner_hash: String,
    pub previous_hash: Option<String>,
    pub issuer: String,
    pub previous_issuer: Option<String>,
    pub time: u64,
    pub pow_min: u64,
    #[serde(rename = "unitbase")]
    pub unit_base: u64,
    pub members_count: u64,
    pub issuers_count: u64,
    pub issuers_frame: u64,
    pub issuers_frame_var: i64,
    pub identities: Vec<String>,
    pub joiners: Vec<String>,
    pub actives: Vec<String>,
    pub leavers: Vec<String>,
    pub revoked: Vec<String>,
    pub excluded: Vec<String>,
    pub certifications: Vec<String>,
    pub transactions: Vec<TransactionInBlockDbV1>,
    pub median_time: u64,
    pub nonce: u64,
    pub fork: bool,
    pub parameters: String,
    pub monetary_mass: u64,
    pub dividend: Option<u64>,
    #[serde(rename = "UDTime")]
    pub ud_time: Option<u64>,
    #[serde(rename = "writtenOn")]
    pub written_on: Option<u64>,
    #[serde(rename = "written_on")]
    pub written_on_str: String,
    pub wrong: bool,
}

impl ValueAsBytes for BlockDbV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, mut f: F) -> KvResult<T> {
        let json = serde_json::to_string(self).map_err(|e| KvError::DeserError(e.into()))?;
        f(json.as_bytes())
    }
}

impl kv_typed::prelude::FromBytes for BlockDbV1 {
    type Err = CorruptedBytes;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let json_str = std::str::from_utf8(bytes).expect("corrupted db : invalid utf8 bytes");
        Ok(serde_json::from_str(&json_str)
            .map_err(|e| CorruptedBytes(format!("{}: '{}'", e, json_str)))?)
    }
}

impl ToDumpString for BlockDbV1 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for BlockDbV1 {
    fn from_explorer_str(source: &str) -> Result<Self, FromExplorerValueErr> {
        Self::from_bytes(source.as_bytes()).map_err(|e| FromExplorerValueErr(e.0.into()))
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        serde_json::to_value(self).map_err(|e| KvError::DeserError(e.into()))
    }
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionInBlockDbV1 {
    version: u64,
    currency: String,
    #[serde(rename = "locktime")]
    lock_time: u64,
    hash: Option<String>,
    blockstamp: String,
    blockstamp_time: u64,
    issuers: SmallVec<[String; 1]>,
    inputs: SmallVec<[String; 4]>,
    outputs: SmallVec<[String; 2]>,
    unlocks: SmallVec<[String; 4]>,
    signatures: SmallVec<[String; 1]>,
    comment: String,
}

// V2

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
pub struct BlockDbV2(pub dubp::block::DubpBlockV10);

impl ValueAsBytes for BlockDbV2 {
    fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, mut f: F) -> KvResult<T> {
        let bytes = bincode::serialize(self).map_err(|e| KvError::DeserError(e.into()))?;
        f(bytes.as_ref())
    }
}

impl kv_typed::prelude::FromBytes for BlockDbV2 {
    type Err = CorruptedBytes;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        Ok(bincode::deserialize(&bytes)
            .map_err(|e| CorruptedBytes(format!("{}: '{:?}'", e, bytes)))?)
    }
}

impl ToDumpString for BlockDbV2 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for BlockDbV2 {
    fn from_explorer_str(source: &str) -> Result<Self, FromExplorerValueErr> {
        Ok(serde_json::from_str(source).map_err(|e| FromExplorerValueErr(e.into()))?)
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        serde_json::to_value(self).map_err(|e| KvError::DeserError(e.into()))
    }
}

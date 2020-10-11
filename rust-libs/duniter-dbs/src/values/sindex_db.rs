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

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SIndexDBV1 {
    pub src_type: String,
    pub tx: Option<String>,
    pub identifier: String,
    pub pos: u32,
    #[serde(rename = "created_on")]
    pub created_on: Option<String>,
    #[serde(rename = "written_time")]
    pub written_time: u64,
    #[serde(rename = "locktime")]
    pub lock_time: u64,
    pub unlock: Option<String>,
    pub amount: u32,
    pub base: u32,
    pub conditions: String,
    pub consumed: bool,
    pub tx_obj: TransactionInBlockDbV1,
    pub age: u64,
    #[serde(rename = "type")]
    pub type_: Option<String>,
    pub available: Option<bool>,
    pub is_locked: Option<bool>,
    pub is_time_locked: Option<bool>,
}

impl ValueAsBytes for SIndexDBV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, mut f: F) -> KvResult<T> {
        let json =
            serde_json::to_string(self).map_err(|e| KvError::DeserError(format!("{}", e)))?;
        f(json.as_bytes())
    }
}

impl kv_typed::prelude::FromBytes for SIndexDBV1 {
    type Err = StringErr;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let json_str = std::str::from_utf8(bytes).expect("corrupted db : invalid utf8 bytes");
        Ok(serde_json::from_str(&json_str)
            .map_err(|e| StringErr(format!("{}: '{}'", e, json_str)))?)
    }
}

impl ToDumpString for SIndexDBV1 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for SIndexDBV1 {
    fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
        Self::from_bytes(source.as_bytes())
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        serde_json::to_value(self).map_err(|e| KvError::DeserError(format!("{}", e)))
    }
}

#[derive(Clone, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
pub struct SourceKeyArrayDbV1(pub SmallVec<[SourceKeyV1; 8]>);

impl ValueAsBytes for SourceKeyArrayDbV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, mut f: F) -> KvResult<T> {
        let vec_pub_str = self
            .0
            .iter()
            .map(|source_key| source_key.to_string())
            .collect::<SmallVec<[String; 8]>>();
        let json = serde_json::to_string(&vec_pub_str)
            .map_err(|e| KvError::DeserError(format!("{}", e)))?;
        f(json.as_bytes())
    }
}

impl kv_typed::prelude::FromBytes for SourceKeyArrayDbV1 {
    type Err = StringErr;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let json_str = std::str::from_utf8(bytes).expect("corrupted db : invalid utf8 bytes");
        let vec_source_key_str: SmallVec<[String; 8]> = serde_json::from_str(&json_str)
            .map_err(|e| StringErr(format!("{}: '{}'", e, json_str)))?;
        Ok(Self(
            vec_source_key_str
                .into_iter()
                .map(|source_key_str| {
                    SourceKeyV1::from_bytes(source_key_str.as_bytes())
                        .map_err(|e| StringErr(format!("{}", e)))
                })
                .collect::<std::result::Result<SmallVec<[SourceKeyV1; 8]>, Self::Err>>()?,
        ))
    }
}

impl ToDumpString for SourceKeyArrayDbV1 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for SourceKeyArrayDbV1 {
    fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
        Self::from_bytes(source.as_bytes())
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        serde_json::to_value(self).map_err(|e| KvError::DeserError(format!("{}", e)))
    }
}

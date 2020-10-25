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

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct IIndexDbV1(pub SmallVec<[IIndexLineDbV1; 1]>);

impl ValueAsBytes for IIndexDbV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, mut f: F) -> KvResult<T> {
        let json_string =
            serde_json::to_string(self).map_err(|e| KvError::DeserError(format!("{}", e)))?;
        f(format!("[{}]", json_string).as_bytes())
    }
}

impl kv_typed::prelude::FromBytes for IIndexDbV1 {
    type Err = StringErr;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let json_str = std::str::from_utf8(bytes).expect("corrupted db : invalid utf8 bytes");
        //println!("json_str='{}'", &json_str);
        Ok(serde_json::from_str(&json_str)
            .map_err(|e| StringErr(format!("{}: '{}'", e, json_str)))?)
    }
}

impl ToDumpString for IIndexDbV1 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for IIndexDbV1 {
    fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
        Self::from_bytes(source.as_bytes())
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        serde_json::to_value(self).map_err(|e| KvError::DeserError(format!("{}", e)))
    }
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IIndexLineDbV1 {
    pub op: String,
    #[serde(rename = "writtenOn")]
    pub written_on: Option<u64>,
    #[serde(rename = "written_on")]
    pub written_on_str: String,
    pub uid: Option<String>,
    #[serde(rename = "pub")]
    pub pubkey: String,
    pub hash: Option<String>,
    pub sig: Option<String>,
    #[serde(rename = "created_on")]
    pub created_on: Option<String>,
    pub member: Option<bool>,
    pub was_member: Option<bool>,
    pub kick: Option<bool>,
    #[serde(rename = "wotb_id")]
    pub wotb_id: Option<usize>,
    pub age: Option<u64>,
    pub pub_unique: Option<bool>,
    pub excluded_is_member: Option<bool>,
    pub is_being_kicked: Option<bool>,
    pub uid_unique: Option<bool>,
    pub has_to_be_excluded: Option<bool>,
}

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
pub struct MIndexDbV1(pub SmallVec<[MIndexLineDbV1; 1]>);

impl ValueAsBytes for MIndexDbV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, mut f: F) -> KvResult<T> {
        let json_string =
            serde_json::to_string(self).map_err(|e| KvError::DeserError(format!("{}", e)))?;
        f(format!("[{}]", json_string).as_bytes())
    }
}

impl kv_typed::prelude::FromBytes for MIndexDbV1 {
    type Err = StringErr;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let json_str = std::str::from_utf8(bytes).expect("corrupted db : invalid utf8 bytes");
        //println!("json_str='{}'", &json_str);
        Ok(serde_json::from_str(&json_str)
            .map_err(|e| StringErr(format!("{}: '{}'", e, json_str)))?)
    }
}

impl ToDumpString for MIndexDbV1 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for MIndexDbV1 {
    fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
        Self::from_bytes(source.as_bytes())
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        serde_json::to_value(self).map_err(|e| KvError::DeserError(format!("{}", e)))
    }
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MIndexLineDbV1 {
    pub op: String,
    #[serde(rename = "writtenOn")]
    pub written_on: Option<u64>,
    #[serde(rename = "written_on")]
    pub written_on_str: String,
    #[serde(rename = "pub")]
    pub pubkey: String,
    pub created_on: Option<String>,
    #[serde(rename = "type")]
    pub r#type: Option<String>,
    #[serde(rename = "expires_on")]
    pub expires_on: Option<u64>,
    #[serde(rename = "expired_on")]
    pub expired_on: Option<u64>,
    pub revocation: Option<String>,
    #[serde(rename = "revokes_on")]
    pub revokes_on: Option<u64>,
    #[serde(rename = "chainable_on")]
    pub chainable_on: Option<u64>,
    #[serde(rename = "revoked_on")]
    pub revoked_on: Option<String>,
    pub leaving: Option<bool>,
    pub age: Option<u64>,
    pub is_being_revoked: Option<bool>,
    pub unchainables: Option<u64>,
    pub number_following: Option<bool>,
    #[serde(rename = "distanceOK")]
    pub distance_ok: Option<bool>,
    pub on_revoked: Option<bool>,
    pub joins_twice: Option<bool>,
    pub enough_certs: Option<bool>,
    pub leaver_is_member: Option<bool>,
    pub active_is_member: Option<bool>,
    pub revoked_is_member: Option<bool>,
    pub already_revoked: Option<bool>,
    #[serde(rename = "revocationSigOK")]
    pub revocation_sig_ok: Option<bool>,
    #[serde(rename = "created_on_ref")]
    pub created_on_ref: Option<BlockstampTimed>,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockstampTimed {
    pub median_time: u64,
    pub number: u32,
    pub hash: String,
}

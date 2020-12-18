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
pub struct BlockHeadDbV1 {
    pub version: u64,
    pub currency: Option<String>,
    #[serde(rename = "bsize")]
    pub block_size: u64,
    pub avg_block_size: u64,
    pub ud_time: u64,
    pub ud_reeval_time: u64,
    pub mass_reeval: u64,
    pub mass: u64,
    pub hash: String,
    pub previous_hash: Option<String>,
    pub previous_issuer: Option<String>,
    pub issuer: String,
    pub time: u64,
    pub median_time: u64,
    pub number: u64,
    pub pow_min: u64,
    pub diff_number: u64,
    pub issuers_count: u64,
    pub issuers_frame: u64,
    pub issuers_frame_var: i64,
    pub issuer_diff: u64,
    pub pow_zeros: u64,
    pub pow_remainder: u64,
    pub speed: f64,
    pub unit_base: u64,
    pub members_count: u64,
    pub dividend: u64,
    #[serde(rename = "new_dividend")]
    pub new_dividend: Option<u64>,
    pub issuer_is_member: bool,
}

impl AsBytes for BlockHeadDbV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        let json = serde_json::to_string(self).unwrap_or_else(|_| unreachable!());
        f(json.as_bytes())
    }
}

impl kv_typed::prelude::FromBytes for BlockHeadDbV1 {
    type Err = CorruptedBytes;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let json_str = std::str::from_utf8(bytes).expect("corrupted db : invalid utf8 bytes");
        Ok(serde_json::from_str(&json_str)
            .map_err(|e| CorruptedBytes(format!("{}: '{}'", e, json_str)))?)
    }
}

impl ToDumpString for BlockHeadDbV1 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for BlockHeadDbV1 {
    fn from_explorer_str(source: &str) -> Result<Self, FromExplorerValueErr> {
        Self::from_bytes(source.as_bytes()).map_err(|e| FromExplorerValueErr(e.0.into()))
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        serde_json::to_value(self).map_err(|e| KvError::DeserError(e.into()))
    }
}

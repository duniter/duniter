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
pub struct UdEntryDbV1 {
    #[serde(rename = "pub")]
    pub pubkey: String,
    pub member: bool,
    pub availables: Vec<u32>,
    pub consumed: Vec<u32>,
    #[serde(rename = "consumedUDs")]
    pub consumed_uds: Vec<ConsumedUdDbV1>,
    pub dividends: Vec<UdAmountDbV1>,
}

impl ValueAsBytes for UdEntryDbV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, mut f: F) -> KvResult<T> {
        let json =
            serde_json::to_string(self).map_err(|e| KvError::DeserError(format!("{}", e)))?;
        f(json.as_bytes())
    }
}

impl kv_typed::prelude::FromBytes for UdEntryDbV1 {
    type Err = StringErr;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let json_str = std::str::from_utf8(bytes).expect("corrupted db : invalid utf8 bytes");
        Ok(serde_json::from_str(&json_str)
            .map_err(|e| StringErr(format!("{}: '{}'", e, json_str)))?)
    }
}

impl ToDumpString for UdEntryDbV1 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for UdEntryDbV1 {
    fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
        Self::from_bytes(source.as_bytes())
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        serde_json::to_value(self).map_err(|e| KvError::DeserError(format!("{}", e)))
    }
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsumedUdDbV1 {
    pub dividend_number: u32,
    pub tx_hash: String,
    pub tx_created_on: String,
    #[serde(rename = "txLocktime")]
    pub tx_lock_time: u32,
    pub dividend: UdAmountDbV1,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
pub struct UdAmountDbV1 {
    pub amount: u32,
    pub base: u32,
}

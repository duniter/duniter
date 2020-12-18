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
pub struct BlockNumberArrayV1(pub SmallVec<[BlockNumber; 1]>);

impl ValueAsBytes for BlockNumberArrayV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, mut f: F) -> KvResult<T> {
        let json_string = serde_json::to_string(self).map_err(|e| KvError::DeserError(e.into()))?;
        f(format!("[{}]", json_string).as_bytes())
    }
}

impl kv_typed::prelude::FromBytes for BlockNumberArrayV1 {
    type Err = CorruptedBytes;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let json_str = std::str::from_utf8(bytes).expect("corrupted db : invalid utf8 bytes");
        //println!("json_str='{}'", &json_str);
        Ok(serde_json::from_str(&json_str)
            .map_err(|e| CorruptedBytes(format!("{}: '{}'", e, json_str)))?)
    }
}

impl ToDumpString for BlockNumberArrayV1 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for BlockNumberArrayV1 {
    fn from_explorer_str(source: &str) -> Result<Self, FromExplorerValueErr> {
        Self::from_bytes(source.as_bytes()).map_err(|e| FromExplorerValueErr(e.0.into()))
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        serde_json::to_value(self).map_err(|e| KvError::DeserError(e.into()))
    }
}

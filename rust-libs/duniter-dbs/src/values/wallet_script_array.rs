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

#[derive(Debug, Default, PartialEq)]
pub struct WalletScriptArrayV2(pub std::collections::HashSet<WalletScriptV10>);

impl ValueAsBytes for WalletScriptArrayV2 {
    fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, mut f: F) -> KvResult<T> {
        f(&bincode::serialize(&self.0).map_err(|e| KvError::DeserError(e.into()))?)
    }
}

impl kv_typed::prelude::FromBytes for WalletScriptArrayV2 {
    type Err = bincode::Error;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        Ok(Self(bincode::deserialize(bytes)?))
    }
}

impl ToDumpString for WalletScriptArrayV2 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for WalletScriptArrayV2 {
    fn from_explorer_str(_: &str) -> std::result::Result<Self, FromExplorerValueErr> {
        unimplemented!()
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        Ok(serde_json::Value::Array(
            self.0
                .iter()
                .map(|script| serde_json::Value::String(script.to_string()))
                .collect(),
        ))
    }
}

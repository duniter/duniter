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
pub struct UtxosOfScriptV1(pub BTreeMap<i64, SmallVec<[(UtxoIdV10, SourceAmount); 4]>>);

impl ValueAsBytes for UtxosOfScriptV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, mut f: F) -> KvResult<T> {
        f(&bincode::serialize(&self.0).map_err(|e| KvError::DeserError(format!("{}", e)))?)
    }
}

impl kv_typed::prelude::FromBytes for UtxosOfScriptV1 {
    type Err = StringErr;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        Ok(Self(
            bincode::deserialize(bytes).map_err(|e| StringErr(format!("{}", e)))?,
        ))
    }
}

impl ToDumpString for UtxosOfScriptV1 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for UtxosOfScriptV1 {
    fn from_explorer_str(_: &str) -> std::result::Result<Self, StringErr> {
        unimplemented!()
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        Ok(serde_json::Value::Object(
            self.0
                .iter()
                .map(|(wt, utxos)| {
                    (
                        wt.to_string(),
                        serde_json::Value::Array(
                            utxos
                                .iter()
                                .map(|(utxo_id, amount)| {
                                    serde_json::Value::String(format!("{}:{}", amount, utxo_id))
                                })
                                .collect(),
                        ),
                    )
                })
                .collect(),
        ))
    }
}

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

use dubp::documents::transaction::TransactionDocumentV10;

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
pub struct GvaTxDbV1 {
    pub tx: TransactionDocumentV10,
    pub written_block: Blockstamp,
    pub written_time: i64,
}

impl AsBytes for GvaTxDbV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        let bytes = bincode::serialize(self).unwrap_or_else(|_| unreachable!());
        f(bytes.as_ref())
    }
}

impl kv_typed::prelude::FromBytes for GvaTxDbV1 {
    type Err = CorruptedBytes;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        Ok(bincode::deserialize(&bytes)
            .map_err(|e| CorruptedBytes(format!("{}: '{:?}'", e, bytes)))?)
    }
}

impl ToDumpString for GvaTxDbV1 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for GvaTxDbV1 {
    fn from_explorer_str(source: &str) -> Result<Self, FromExplorerValueErr> {
        Self::from_bytes(source.as_bytes()).map_err(|e| FromExplorerValueErr(e.0.into()))
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        serde_json::to_value(self).map_err(|e| KvError::DeserError(e.into()))
    }
}
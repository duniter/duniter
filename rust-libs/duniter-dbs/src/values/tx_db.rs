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
pub struct PendingTxDbV2(pub TransactionDocumentV10);

impl ValueAsBytes for PendingTxDbV2 {
    fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, mut f: F) -> KvResult<T> {
        let bytes = bincode::serialize(self).map_err(|e| KvError::DeserError(e.into()))?;
        f(bytes.as_ref())
    }
}

impl kv_typed::prelude::FromBytes for PendingTxDbV2 {
    type Err = CorruptedBytes;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        Ok(bincode::deserialize(&bytes)
            .map_err(|e| CorruptedBytes(format!("{}: '{:?}'", e, bytes)))?)
    }
}

impl ToDumpString for PendingTxDbV2 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for PendingTxDbV2 {
    fn from_explorer_str(source: &str) -> Result<Self, FromExplorerValueErr> {
        Self::from_bytes(source.as_bytes()).map_err(|e| FromExplorerValueErr(e.0.into()))
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        serde_json::to_value(self).map_err(|e| KvError::DeserError(e.into()))
    }
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
pub struct TxDbV2 {
    pub tx: TransactionDocumentV10,
    pub written_block: Blockstamp,
    pub written_time: i64,
}

impl ValueAsBytes for TxDbV2 {
    fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, mut f: F) -> KvResult<T> {
        let bytes = bincode::serialize(self).map_err(|e| KvError::DeserError(e.into()))?;
        f(bytes.as_ref())
    }
}

impl kv_typed::prelude::FromBytes for TxDbV2 {
    type Err = CorruptedBytes;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        Ok(bincode::deserialize(&bytes)
            .map_err(|e| CorruptedBytes(format!("{}: '{:?}'", e, bytes)))?)
    }
}

impl ToDumpString for TxDbV2 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for TxDbV2 {
    fn from_explorer_str(source: &str) -> Result<Self, FromExplorerValueErr> {
        Self::from_bytes(source.as_bytes()).map_err(|e| FromExplorerValueErr(e.0.into()))
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        serde_json::to_value(self).map_err(|e| KvError::DeserError(e.into()))
    }
}

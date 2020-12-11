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

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct WalletScriptWithSourceAmountV1Db {
    pub wallet_script: WalletScriptV10,
    pub source_amount: SourceAmount,
}

impl ValueAsBytes for WalletScriptWithSourceAmountV1Db {
    fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, mut f: F) -> KvResult<T> {
        f(&bincode::serialize(&self).map_err(|e| KvError::DeserError(format!("{}", e)))?)
    }
}

impl kv_typed::prelude::FromBytes for WalletScriptWithSourceAmountV1Db {
    type Err = StringErr;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        Ok(bincode::deserialize(bytes).map_err(|e| StringErr(format!("{}", e)))?)
    }
}

impl ToDumpString for WalletScriptWithSourceAmountV1Db {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for WalletScriptWithSourceAmountV1Db {
    fn from_explorer_str(_: &str) -> std::result::Result<Self, StringErr> {
        unimplemented!()
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        Ok(serde_json::to_value(self).map_err(|e| KvError::DeserError(e.to_string()))?)
    }
}

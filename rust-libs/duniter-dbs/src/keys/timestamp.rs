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

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, PartialOrd)]
pub struct TimestampKeyV1(pub u64);

impl AsBytes for TimestampKeyV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        f(format!("{}", self.0).as_bytes())
    }
}

impl kv_typed::prelude::FromBytes for TimestampKeyV1 {
    type Err = CorruptedBytes;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let key_str = std::str::from_utf8(bytes).map_err(|e| CorruptedBytes(e.to_string()))?;
        Ok(TimestampKeyV1(key_str.parse().map_err(|e| {
            CorruptedBytes(format!("{}: {}", e, key_str))
        })?))
    }
}

impl ToDumpString for TimestampKeyV1 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableKey for TimestampKeyV1 {
    fn from_explorer_str(source: &str) -> Result<Self, FromExplorerKeyErr> {
        NaiveDateTime::parse_from_str(source, "%Y-%m-%d %H:%M:%S")
            .map(|dt| TimestampKeyV1(dt.timestamp() as u64))
            .map_err(|e| FromExplorerKeyErr(format!("{}: {}", e, source).into()))
    }
    fn to_explorer_string(&self) -> KvResult<String> {
        Ok(NaiveDateTime::from_timestamp(self.0 as i64, 0)
            .format("%Y-%m-%d %H:%M:%S")
            .to_string())
    }
}

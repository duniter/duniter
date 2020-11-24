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

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SourceAmountValV2(pub SourceAmount);

impl ValueAsBytes for SourceAmountValV2 {
    fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, mut f: F) -> KvResult<T> {
        use zerocopy::AsBytes as _;
        f(self.0.as_bytes())
    }
}

impl kv_typed::prelude::FromBytes for SourceAmountValV2 {
    type Err = StringErr;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let layout = zerocopy::LayoutVerified::<_, SourceAmount>::new(bytes)
            .ok_or_else(|| StringErr("".to_owned()))?;
        Ok(Self(*layout))
    }
}

impl ToDumpString for SourceAmountValV2 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for SourceAmountValV2 {
    fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
        let mut source = source.split(':');
        let amount_str = source
            .next()
            .ok_or_else(|| StringErr("Missing amount".to_owned()))?;
        let base_str = source
            .next()
            .ok_or_else(|| StringErr("Missing base".to_owned()))?;
        let amount =
            i64::from_str(amount_str).map_err(|e| StringErr(format!("Invalid amount: {}", e)))?;
        let base =
            i64::from_str(base_str).map_err(|e| StringErr(format!("Invalid base: {}", e)))?;
        Ok(Self(SourceAmount::new(amount, base)))
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        Ok(serde_json::Value::String(format!(
            "{}:{}",
            self.0.amount(),
            self.0.base()
        )))
    }
}

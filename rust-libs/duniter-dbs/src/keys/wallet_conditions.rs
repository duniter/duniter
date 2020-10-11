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

const CONDITIONS_MAX_LEN: usize = 256;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, PartialOrd)]
pub struct WalletConditionsV1(pub ArrayString<[u8; CONDITIONS_MAX_LEN]>);

impl KeyAsBytes for WalletConditionsV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        f(self.0.as_str().as_bytes())
    }
}

impl kv_typed::prelude::FromBytes for WalletConditionsV1 {
    type Err = StringErr;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let uid_str = std::str::from_utf8(bytes).map_err(|e| StringErr(format!("{}", e)))?;
        Ok(Self(
            ArrayString::<[u8; CONDITIONS_MAX_LEN]>::from_str(uid_str)
                .map_err(|e| StringErr(format!("{}", e)))?,
        ))
    }
}

impl FromStr for WalletConditionsV1 {
    type Err = arrayvec::CapacityError;

    fn from_str(source: &str) -> std::result::Result<Self, Self::Err> {
        Ok(WalletConditionsV1(
            ArrayString::<[u8; CONDITIONS_MAX_LEN]>::from_str(source)?,
        ))
    }
}

impl ToDumpString for WalletConditionsV1 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableKey for WalletConditionsV1 {
    fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
        Self::from_bytes(source.as_bytes())
    }
    fn to_explorer_string(&self) -> KvResult<String> {
        self.as_bytes(|bytes| Ok(unsafe { std::str::from_utf8_unchecked(bytes) }.to_owned()))
    }
}

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

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct PubKeyAndSigV1(PublicKey, Signature);

impl PubKeyAndSigV1 {
    pub fn all() -> Self {
        Self(PublicKey::default(), Signature([0u8; 64]))
    }
}

impl KeyAsBytes for PubKeyAndSigV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        if self == &Self::all() {
            f(b"ALL")
        } else {
            f(format!("{}:{}", self.0.to_base58(), self.1.to_base64()).as_bytes())
        }
    }
}

impl kv_typed::prelude::FromBytes for PubKeyAndSigV1 {
    type Err = CorruptedBytes;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let raw_str = std::str::from_utf8(bytes).map_err(|e| CorruptedBytes(e.to_string()))?;
        if raw_str == "ALL" {
            Ok(PubKeyAndSigV1::all())
        } else {
            let array_str: ArrayVec<[&str; 2]> = raw_str.split(':').collect();
            let pubkey =
                PublicKey::from_base58(array_str[0]).map_err(|e| CorruptedBytes(e.to_string()))?;
            let sig =
                Signature::from_base64(array_str[1]).map_err(|e| CorruptedBytes(e.to_string()))?;
            Ok(PubKeyAndSigV1(pubkey, sig))
        }
    }
}

impl ToDumpString for PubKeyAndSigV1 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableKey for PubKeyAndSigV1 {
    fn from_explorer_str(source: &str) -> Result<Self, FromExplorerKeyErr> {
        Self::from_bytes(source.as_bytes()).map_err(|e| FromExplorerKeyErr(e.0.into()))
    }
    fn to_explorer_string(&self) -> KvResult<String> {
        self.as_bytes(|bytes| Ok(unsafe { std::str::from_utf8_unchecked(bytes) }.to_owned()))
    }
}

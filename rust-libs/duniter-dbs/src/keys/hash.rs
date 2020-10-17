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
pub struct HashKeyV1(pub Hash);

impl KeyAsBytes for HashKeyV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        f(self.0.to_hex().as_bytes())
    }
}

impl kv_typed::prelude::FromBytes for HashKeyV1 {
    type Err = StringErr;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let hash_str = std::str::from_utf8(bytes).map_err(|e| StringErr(format!("{}", e)))?;
        Ok(HashKeyV1(
            Hash::from_hex(&hash_str).map_err(|e| StringErr(format!("{}", e)))?,
        ))
    }
}

impl ToDumpString for HashKeyV1 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableKey for HashKeyV1 {
    fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
        Self::from_bytes(source.as_bytes())
    }
    fn to_explorer_string(&self) -> KvResult<String> {
        self.as_bytes(|bytes| Ok(unsafe { std::str::from_utf8_unchecked(bytes) }.to_owned()))
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, PartialOrd)]
#[repr(transparent)]
pub struct HashKeyV2(pub Hash);

impl HashKeyV2 {
    pub fn from_ref(hash: &Hash) -> &Self {
        #[allow(trivial_casts)]
        unsafe {
            &*(hash as *const Hash as *const HashKeyV2)
        }
    }
}

impl KeyAsBytes for HashKeyV2 {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        f(self.0.as_ref())
    }
}

impl kv_typed::prelude::FromBytes for HashKeyV2 {
    type Err = StringErr;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        if bytes.len() != 32 {
            Err(StringErr(format!(
                "Invalid length: expected 32 found {}",
                bytes.len()
            )))
        } else {
            let mut buffer = [0u8; 32];
            buffer.copy_from_slice(bytes);
            Ok(HashKeyV2(Hash(buffer)))
        }
    }
}

impl ToDumpString for HashKeyV2 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableKey for HashKeyV2 {
    fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
        Ok(Self(
            Hash::from_hex(source).map_err(|e| StringErr(format!("{}", e)))?,
        ))
    }
    fn to_explorer_string(&self) -> KvResult<String> {
        Ok(self.0.to_hex())
    }
}

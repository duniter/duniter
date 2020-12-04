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

// V1

#[derive(Copy, Clone, Debug, PartialEq)]
pub struct PublicKeySingletonDbV1(pub PublicKey);

impl ValueAsBytes for PublicKeySingletonDbV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, mut f: F) -> KvResult<T> {
        f(format!("[\"{}\"]", self.0).as_bytes())
    }
}

impl kv_typed::prelude::FromBytes for PublicKeySingletonDbV1 {
    type Err = BaseConversionError;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let mut pubkey_str = std::str::from_utf8(bytes).expect("corrupted db : invalid utf8 bytes");

        pubkey_str = &pubkey_str[2..pubkey_str.len() - 2];
        Ok(Self(PublicKey::from_base58(pubkey_str)?))
    }
}

impl ToDumpString for PublicKeySingletonDbV1 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for PublicKeySingletonDbV1 {
    fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
        Ok(Self(
            PublicKey::from_base58(source).map_err(|e| StringErr(format!("{}", e)))?,
        ))
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        Ok(serde_json::Value::String(self.0.to_base58()))
    }
}

#[derive(Clone, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
pub struct PublicKeyArrayDbV1(pub SmallVec<[PublicKey; 8]>);

impl ValueAsBytes for PublicKeyArrayDbV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, mut f: F) -> KvResult<T> {
        let vec_pub_str = self
            .0
            .iter()
            .map(|pubkey| pubkey.to_base58())
            .collect::<SmallVec<[String; 8]>>();
        let json = serde_json::to_string(&vec_pub_str)
            .map_err(|e| KvError::DeserError(format!("{}", e)))?;
        f(json.as_bytes())
    }
}

impl kv_typed::prelude::FromBytes for PublicKeyArrayDbV1 {
    type Err = StringErr;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let json_str = std::str::from_utf8(bytes).expect("corrupted db : invalid utf8 bytes");
        let vec_pub_str: SmallVec<[String; 8]> = serde_json::from_str(&json_str)
            .map_err(|e| StringErr(format!("{}: '{}'", e, json_str)))?;
        Ok(Self(
            vec_pub_str
                .into_iter()
                .map(|pub_str| {
                    PublicKey::from_base58(&pub_str).map_err(|e| StringErr(format!("{}", e)))
                })
                .collect::<std::result::Result<SmallVec<[PublicKey; 8]>, Self::Err>>()?,
        ))
    }
}

impl ToDumpString for PublicKeyArrayDbV1 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for PublicKeyArrayDbV1 {
    fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
        Self::from_bytes(source.as_bytes())
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        Ok(serde_json::Value::Array(
            self.0
                .iter()
                .map(|pubkey| serde_json::Value::String(pubkey.to_base58()))
                .collect(),
        ))
    }
}

// V2

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PubKeyValV2(pub PublicKey);

impl ValueAsBytes for PubKeyValV2 {
    fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, mut f: F) -> KvResult<T> {
        f(self.0.as_ref())
    }
}

impl kv_typed::prelude::FromBytes for PubKeyValV2 {
    type Err = StringErr;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        Ok(PubKeyValV2(
            PublicKey::try_from(bytes).map_err(|e| StringErr(format!("{}: {:?}", e, bytes)))?,
        ))
    }
}

impl ToDumpString for PubKeyValV2 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for PubKeyValV2 {
    fn from_explorer_str(pubkey_str: &str) -> std::result::Result<Self, StringErr> {
        Ok(PubKeyValV2(PublicKey::from_base58(&pubkey_str).map_err(
            |e| StringErr(format!("{}: {}", e, pubkey_str)),
        )?))
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        Ok(serde_json::Value::String(self.0.to_base58()))
    }
}

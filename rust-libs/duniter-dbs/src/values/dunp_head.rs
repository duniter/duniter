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

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
pub struct DunpHeadDbV1 {
    pub api: String,
    pub pubkey: PublicKey,
    pub blockstamp: Blockstamp,
    pub software: String,
    pub software_version: String,
    pub pow_prefix: u32,
    pub free_member_room: u32,
    pub free_mirror_room: u32,
    pub signature: Signature,
}

impl DunpHeadDbV1 {
    pub fn from_stringified(message_v2: &str, signature: &str) -> KvResult<(DunpNodeIdV1Db, Self)> {
        let signature =
            Signature::from_base64(signature).map_err(|e| KvError::DeserError(e.into()))?;

        let strs: SmallVec<[&str; 11]> = message_v2.split(':').collect();
        if strs.len() < 11 {
            return Err(KvError::DeserError(
                "DunpHeadDbV1::from_stringified(): invalid message_v2".into(),
            ));
        }

        let uuid = u32::from_str_radix(strs[5], 16).map_err(|e| KvError::DeserError(e.into()))?;
        let pubkey = PublicKey::from_base58(strs[3]).map_err(|e| KvError::DeserError(e.into()))?;
        let blockstamp =
            Blockstamp::from_str(strs[4]).map_err(|e| KvError::DeserError(e.into()))?;

        Ok((
            DunpNodeIdV1Db::new(uuid, pubkey),
            DunpHeadDbV1 {
                api: strs[0].to_owned(),
                pubkey,
                blockstamp,
                software: strs[6].to_owned(),
                software_version: strs[7].to_owned(),
                pow_prefix: u32::from_str(strs[8]).map_err(|e| KvError::DeserError(e.into()))?,
                free_member_room: u32::from_str(strs[9])
                    .map_err(|e| KvError::DeserError(e.into()))?,
                free_mirror_room: u32::from_str(strs[10])
                    .map_err(|e| KvError::DeserError(e.into()))?,
                signature,
            },
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dunp_head_from_stringified() -> KvResult<()> {
        let message = "WS2POCAIC:HEAD:2:GX1nYVburxeaVP1SCNuhVKwNy6M2h6wPamHhyoSF4Ccn:379783-0000001BB2B88D077605C1330CA60AA222624FAA3BA60566D6CA51A9122376F7:882a5ad1:duniter:1.8.1:1:1:1";
        let sig = "qBvJ7JZ4i8tKeItmZ/lurzr5O2/jKnB1reoIjEIl5x6sqbAhVsVsHut85yQoP30tURGfVX5FwMhCuC4DvCSFCg==";
        let (node_id, head) = DunpHeadDbV1::from_stringified(message, sig)?;

        assert_eq!(&format!("{:x}", node_id.get_uuid()), "882a5ad1");
        assert_eq!(
            &node_id.get_pubkey().to_string(),
            "GX1nYVburxeaVP1SCNuhVKwNy6M2h6wPamHhyoSF4Ccn"
        );
        assert_eq!(&head.api, "WS2POCAIC");
        assert_eq!(
            &head.pubkey.to_string(),
            "GX1nYVburxeaVP1SCNuhVKwNy6M2h6wPamHhyoSF4Ccn"
        );
        assert_eq!(
            &head.blockstamp.to_string(),
            "379783-0000001BB2B88D077605C1330CA60AA222624FAA3BA60566D6CA51A9122376F7"
        );
        Ok(())
    }
}

impl AsBytes for DunpHeadDbV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        let bytes = bincode::serialize(self).unwrap_or_else(|_| unreachable!());
        f(bytes.as_ref())
    }
}

impl kv_typed::prelude::FromBytes for DunpHeadDbV1 {
    type Err = CorruptedBytes;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        Ok(bincode::deserialize(&bytes)
            .map_err(|e| CorruptedBytes(format!("{}: '{:?}'", e, bytes)))?)
    }
}

impl ToDumpString for DunpHeadDbV1 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for DunpHeadDbV1 {
    fn from_explorer_str(_source: &str) -> std::result::Result<Self, FromExplorerValueErr> {
        unimplemented!()
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        serde_json::to_value(self).map_err(|e| KvError::DeserError(e.into()))
    }
}

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
use std::fmt::Display;
use uninit::prelude::*;

#[derive(
    Debug, Copy, Clone, Hash, PartialEq, Eq, PartialOrd, Ord, zerocopy::AsBytes, zerocopy::FromBytes,
)]
#[repr(transparent)]
pub struct DunpNodeIdV1Db([u8; 37]); // uuid ++ pubkey

impl DunpNodeIdV1Db {
    pub fn new(uuid: u32, pubkey: PublicKey) -> Self {
        let mut buffer = uninit_array![u8; 37];
        let (uuid_buffer, pubkey_buffer) = buffer.as_out().split_at_out(4);

        uuid_buffer.copy_from_slice(&uuid.to_be_bytes()[..]);
        pubkey_buffer.copy_from_slice(pubkey.as_ref());

        Self(unsafe { std::mem::transmute(buffer) })
    }
    pub fn get_uuid(&self) -> u32 {
        let mut buffer = uninit_array![u8; 4];

        buffer.as_out().copy_from_slice(&self.0[..4]);

        u32::from_be_bytes(unsafe { std::mem::transmute(buffer) })
    }
    pub fn get_pubkey(&self) -> PublicKey {
        let mut buffer = uninit_array![u8; 33];

        buffer.as_out().copy_from_slice(&self.0[4..]);
        let bytes: [u8; 33] = unsafe { std::mem::transmute(buffer) };

        PublicKey::try_from(&bytes[..]).unwrap_or_else(|_| unreachable!())
    }
}

impl Default for DunpNodeIdV1Db {
    fn default() -> Self {
        DunpNodeIdV1Db([0u8; 37])
    }
}

impl Display for DunpNodeIdV1Db {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:x}-{}", self.get_uuid(), self.get_pubkey())
    }
}

impl KeyAsBytes for DunpNodeIdV1Db {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        f(self.0.as_ref())
    }
}

impl kv_typed::prelude::FromBytes for DunpNodeIdV1Db {
    type Err = CorruptedBytes;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let layout = zerocopy::LayoutVerified::<_, DunpNodeIdV1Db>::new(bytes)
            .ok_or_else(|| CorruptedBytes("corrupted db".to_owned()))?;
        Ok(*layout)
    }
}

impl ToDumpString for DunpNodeIdV1Db {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableKey for DunpNodeIdV1Db {
    fn from_explorer_str(_: &str) -> std::result::Result<Self, FromExplorerKeyErr> {
        unimplemented!()
    }
    fn to_explorer_string(&self) -> KvResult<String> {
        Ok(self.to_string())
    }
}

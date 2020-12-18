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
pub struct WalletHashWithBnV1Db([u8; 36]); // wallet_hash ++ block_number

impl WalletHashWithBnV1Db {
    pub fn new(hash: Hash, block_number: BlockNumber) -> Self {
        let mut buffer = uninit_array![u8; 36];
        let (hash_buffer, bn_buffer) = buffer.as_out().split_at_out(32);

        hash_buffer.copy_from_slice(hash.as_ref());
        bn_buffer.copy_from_slice(&block_number.0.to_be_bytes()[..]);

        Self(unsafe { std::mem::transmute(buffer) })
    }
    pub fn get_wallet_hash(&self) -> Hash {
        let mut buffer = uninit_array![u8; 32];

        buffer.as_out().copy_from_slice(&self.0[..32]);
        let bytes: [u8; 32] = unsafe { std::mem::transmute(buffer) };

        Hash(bytes)
    }
    pub fn get_block_number(&self) -> u32 {
        let mut buffer = uninit_array![u8; 4];

        buffer.as_out().copy_from_slice(&self.0[32..]);

        u32::from_be_bytes(unsafe { std::mem::transmute(buffer) })
    }
}

impl Default for WalletHashWithBnV1Db {
    fn default() -> Self {
        WalletHashWithBnV1Db([0u8; 36])
    }
}

impl Display for WalletHashWithBnV1Db {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}:{}", self.get_wallet_hash(), self.get_block_number())
    }
}

impl AsBytes for WalletHashWithBnV1Db {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        f(self.0.as_ref())
    }
}

impl kv_typed::prelude::FromBytes for WalletHashWithBnV1Db {
    type Err = CorruptedBytes;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let layout = zerocopy::LayoutVerified::<_, WalletHashWithBnV1Db>::new(bytes)
            .ok_or_else(|| CorruptedBytes("corrupted db".to_owned()))?;
        Ok(*layout)
    }
}

impl KeyZc for WalletHashWithBnV1Db {
    type Ref = Self;
}

impl ToDumpString for WalletHashWithBnV1Db {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableKey for WalletHashWithBnV1Db {
    fn from_explorer_str(source: &str) -> Result<Self, FromExplorerKeyErr> {
        let mut source = source.split(':');
        let hash_str = source
            .next()
            .ok_or_else(|| FromExplorerKeyErr("missing hash".into()))?;
        let bn_str = source
            .next()
            .ok_or_else(|| FromExplorerKeyErr("missing block number".into()))?;

        let hash = Hash::from_hex(hash_str).map_err(|e| FromExplorerKeyErr(e.into()))?;
        let block_number = bn_str
            .parse()
            .map_err(|e: std::num::ParseIntError| FromExplorerKeyErr(e.into()))?;

        Ok(WalletHashWithBnV1Db::new(hash, block_number))
    }
    fn to_explorer_string(&self) -> KvResult<String> {
        Ok(self.to_string())
    }
}

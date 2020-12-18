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
use std::{collections::HashMap, ops::Deref};

#[derive(
    Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, zerocopy::AsBytes, zerocopy::FromBytes,
)]
#[repr(transparent)]
pub struct UtxoValV2([u8; 52]); // 16(SourceAmount) + 32(Hash) + 4(u32)
impl UtxoValV2 {
    pub fn new(amount: SourceAmount, tx_hash: Hash, output_index: u32) -> Self {
        let mut buffer = [0; 52];
        use zerocopy::AsBytes as _;
        buffer[..16].copy_from_slice(amount.as_bytes());
        buffer[16..48].copy_from_slice(tx_hash.as_ref());
        buffer[48..].copy_from_slice(&output_index.to_le_bytes()[..]);
        Self(buffer)
    }
    pub fn amount(&self) -> &SourceAmount {
        let layout =
            zerocopy::LayoutVerified::<_, SourceAmount>::new(&self.0[..16]).expect("dev error");

        unsafe { std::mem::transmute(layout.deref()) }
    }
    pub fn tx_hash(&self) -> &Hash {
        let layout = zerocopy::LayoutVerified::<_, Hash>::new(&self.0[16..48]).expect("dev error");

        unsafe { std::mem::transmute(layout.deref()) }
    }
    pub fn output_index(&self) -> u32 {
        zerocopy::LayoutVerified::<_, zerocopy::U32<byteorder::LittleEndian>>::new(&self.0[48..])
            .expect("dev error")
            .get()
    }
}

impl Default for UtxoValV2 {
    fn default() -> Self {
        UtxoValV2([0u8; 52])
    }
}

impl std::fmt::Display for UtxoValV2 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let amount = self.amount();
        write!(
            f,
            "{}:{}:T:{}:{}",
            amount.amount(),
            amount.base(),
            self.tx_hash(),
            self.output_index()
        )
    }
}

impl FromStr for UtxoValV2 {
    type Err = CorruptedBytes;

    fn from_str(_s: &str) -> std::result::Result<Self, Self::Err> {
        unimplemented!()
    }
}

impl ValueAsBytes for UtxoValV2 {
    fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, mut f: F) -> KvResult<T> {
        f(self.0.as_ref())
    }
}

impl kv_typed::prelude::FromBytes for UtxoValV2 {
    type Err = LayoutVerifiedErr;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let layout = zerocopy::LayoutVerified::<_, UtxoValV2>::new(bytes)
            .ok_or(LayoutVerifiedErr(stringify!(UtxoValV2)))?;
        Ok(*layout)
    }
}

impl ToDumpString for UtxoValV2 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for UtxoValV2 {
    fn from_explorer_str(_: &str) -> std::result::Result<Self, FromExplorerValueErr> {
        unimplemented!()
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        Ok(serde_json::Value::String(self.to_string()))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct BlockUtxosV2Db(pub HashMap<UtxoIdV10, WalletScriptWithSourceAmountV1Db>);

impl ValueAsBytes for BlockUtxosV2Db {
    fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, mut f: F) -> KvResult<T> {
        f(&bincode::serialize(&self).map_err(|e| KvError::DeserError(e.into()))?)
    }
}

impl kv_typed::prelude::FromBytes for BlockUtxosV2Db {
    type Err = bincode::Error;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        Ok(bincode::deserialize(bytes)?)
    }
}

impl ToDumpString for BlockUtxosV2Db {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableValue for BlockUtxosV2Db {
    fn from_explorer_str(_: &str) -> std::result::Result<Self, FromExplorerValueErr> {
        unimplemented!()
    }
    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        Ok(serde_json::to_value(self).map_err(|e| KvError::DeserError(e.into()))?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utxo_val_v2() {
        let amount = SourceAmount::with_base0(42);
        let tx_hash = Hash::default();
        let output_index = 3;
        let utxo_val = UtxoValV2::new(amount, tx_hash, output_index);

        assert_eq!(utxo_val.amount(), &amount);
        assert_eq!(utxo_val.tx_hash(), &tx_hash);
        assert_eq!(utxo_val.output_index(), output_index);
    }
}

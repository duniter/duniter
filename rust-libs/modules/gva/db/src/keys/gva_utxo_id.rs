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
use uninit::prelude::*;

#[derive(Debug, Copy, Clone, Hash, PartialEq, Eq, PartialOrd, Ord)]
pub struct GvaUtxoIdDbV1([u8; 69]); // script hash ++ block_number ++ tx_hash ++ output_index

impl Default for GvaUtxoIdDbV1 {
    fn default() -> Self {
        GvaUtxoIdDbV1([0u8; 69])
    }
}

impl std::fmt::Display for GvaUtxoIdDbV1 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}:{}:{}:{}",
            self.get_script_hash(),
            self.get_block_number(),
            self.get_tx_hash(),
            self.get_output_index()
        )
    }
}

impl GvaUtxoIdDbV1 {
    pub fn get_script_hash(&self) -> Hash {
        let mut buffer = uninit_array![u8; 32];

        buffer.as_out().copy_from_slice(&self.0[..32]);

        Hash(unsafe { std::mem::transmute(buffer) })
    }
    pub fn get_block_number(&self) -> u32 {
        let mut buffer = uninit_array![u8; 4];

        buffer.as_out().copy_from_slice(&self.0[32..36]);

        u32::from_be_bytes(unsafe { std::mem::transmute(buffer) })
    }
    pub fn get_tx_hash(&self) -> Hash {
        let mut buffer = uninit_array![u8; 32];

        buffer.as_out().copy_from_slice(&self.0[36..68]);

        Hash(unsafe { std::mem::transmute(buffer) })
    }
    pub fn get_output_index(&self) -> u8 {
        self.0[68]
    }
    pub fn new(
        script: WalletScriptV10,
        block_number: u32,
        tx_hash: Hash,
        output_index: u8,
    ) -> Self {
        let script_hash = Hash::compute(script.to_string().as_bytes());
        Self::new_(script_hash, block_number, tx_hash, output_index)
    }
    pub fn new_(script_hash: Hash, block_number: u32, tx_hash: Hash, output_index: u8) -> Self {
        // TODO uncomment when feature const_generics became stable !
        /*let mut buffer = uninit_array![u8; 69];
        let (hash_buffer, rest_buffer) = buffer.as_out().split_at_out(32);
        let (bn_buffer, rest_buffer) = rest_buffer.split_at_out(4);
        let (tx_hash_buffer, output_index_buffer) = rest_buffer.split_at_out(32);
        hash_buffer.copy_from_slice(script_hash.as_ref());
        bn_buffer.copy_from_slice(&block_number.to_be_bytes()[..]);
        tx_hash_buffer.copy_from_slice(tx_hash.as_ref());
        output_index_buffer.copy_from_slice(&[output_index]);

        Self(unsafe { std::mem::transmute(buffer) })*/
        let mut buffer = [0u8; 69];
        buffer[..32].copy_from_slice(script_hash.as_ref());
        buffer[32..36].copy_from_slice(&block_number.to_be_bytes()[..]);
        buffer[36..68].copy_from_slice(tx_hash.as_ref());
        buffer[68] = output_index;
        Self(buffer)
    }
    pub fn script_interval(script_hash: Hash) -> (Self, Self) {
        let mut buffer = [0; 69];
        buffer[..32].copy_from_slice(script_hash.as_ref());
        let min = Self(buffer);
        let mut buffer = [255; 69];
        buffer[..32].copy_from_slice(script_hash.as_ref());
        let max = Self(buffer);

        (min, max)
    }
    pub fn script_block_interval(
        script_hash: Hash,
        block_number_start: u32,
        block_number_end: u32,
    ) -> (Self, Self) {
        (
            Self::new_(script_hash, block_number_start, Hash::default(), 0),
            Self::new_(script_hash, block_number_end, Hash::max(), u8::MAX),
        )
    }
}

impl AsBytes for GvaUtxoIdDbV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        f(&self.0[..])
    }
}

impl FromBytes for GvaUtxoIdDbV1 {
    type Err = CorruptedBytes;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        if bytes.len() == 69 {
            // TODO uncomment when feature const_generics became stable !
            /*let mut buffer = uninit_array![u8; 69];
            buffer.as_out().copy_from_slice(bytes);
            Ok(Self(unsafe { std::mem::transmute(buffer) }))*/
            let mut buffer = [0u8; 69];
            buffer.copy_from_slice(bytes);
            Ok(Self(buffer))
        } else {
            Err(CorruptedBytes("db corrupted".to_owned()))
        }
    }
}

#[cfg(feature = "explorer")]
impl ExplorableKey for GvaUtxoIdDbV1 {
    fn from_explorer_str(_: &str) -> std::result::Result<Self, FromExplorerKeyErr> {
        unimplemented!()
    }
    fn to_explorer_string(&self) -> KvResult<String> {
        Ok(self.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utxo_gva_id_new() {
        let script = WalletScriptV10::single(WalletConditionV10::Csv(86_400));
        let script_hash = Hash::compute(script.to_string().as_bytes());
        let tx_hash = Hash::default();
        let utxo_gva_id = GvaUtxoIdDbV1::new(script, 42, tx_hash, 3);

        assert_eq!(utxo_gva_id.get_script_hash(), script_hash);
        assert_eq!(utxo_gva_id.get_block_number(), 42);
        assert_eq!(utxo_gva_id.get_tx_hash(), tx_hash);
        assert_eq!(utxo_gva_id.get_output_index(), 3);
    }
}

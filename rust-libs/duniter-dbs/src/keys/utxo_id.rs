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

type OutputIndex = u32;

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub struct UtxoIdDbV2(pub Hash, pub OutputIndex);

impl PartialOrd for UtxoIdDbV2 {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        match self.0.partial_cmp(&other.0) {
            Some(std::cmp::Ordering::Equal) => self.1.partial_cmp(&other.1),
            o => o,
        }
    }
}
impl Ord for UtxoIdDbV2 {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        match self.0.cmp(&other.0) {
            std::cmp::Ordering::Equal => self.1.cmp(&other.1),
            o => o,
        }
    }
}

impl KeyAsBytes for UtxoIdDbV2 {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        let mut buffer = uninit_array![u8; 36];
        let (hash_buffer, index_buffer) = buffer.as_out().split_at_out(32);
        let hash_buffer = hash_buffer.copy_from_slice(self.0.as_ref());
        index_buffer.copy_from_slice(&(self.1).to_be_bytes());
        f(unsafe { std::slice::from_raw_parts_mut(hash_buffer.as_mut_ptr(), 36) })
    }
}

impl FromBytes for UtxoIdDbV2 {
    type Err = StringErr;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let hash = zerocopy::LayoutVerified::<_, Hash>::new(&bytes[..32]).ok_or_else(|| {
            StringErr("Corrupted DB: Hash bytes are invalid length or unaligned".to_owned())
        })?;
        let output_index =
            zerocopy::LayoutVerified::<_, zerocopy::U32<byteorder::BigEndian>>::new(&bytes[32..])
                .ok_or_else(|| {
                    StringErr(
                        "Corrupted DB: OutputIndex bytes are invalid length or unaligned"
                            .to_owned(),
                    )
                })?
                .get();
        Ok(UtxoIdDbV2(*hash, output_index))
    }
}

impl ToDumpString for UtxoIdDbV2 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableKey for UtxoIdDbV2 {
    fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
        let mut source = source.split(':');
        if let Some(hash_str) = source.next() {
            let hash =
                Hash::from_hex(&hash_str).map_err(|e| StringErr(format!("{}: {}", e, hash_str)))?;
            if let Some(output_index_str) = source.next() {
                Ok(UtxoIdDbV2(
                    hash,
                    u32::from_str(output_index_str).map_err(|e| StringErr(format!("{}", e)))?,
                ))
            } else {
                Err(StringErr("UtxoIdDbV2: Invalid format".to_owned()))
            }
        } else {
            Err(StringErr("UtxoIdDbV2: Invalid format".to_owned()))
        }
    }
    fn to_explorer_string(&self) -> KvResult<String> {
        Ok(format!("{}:{}", self.0.to_hex(), self.1))
    }
}

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
    pub fn script_block_interval(script_hash: Hash, block_number: u32) -> (Self, Self) {
        (
            Self::new_(script_hash, block_number, Hash::default(), 0),
            Self::new_(script_hash, block_number, Hash::max(), u8::MAX),
        )
    }
}

impl KeyAsBytes for GvaUtxoIdDbV1 {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        f(&self.0[..])
    }
}

impl FromBytes for GvaUtxoIdDbV1 {
    type Err = StringErr;

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
            Err(StringErr("db corrupted".to_owned()))
        }
    }
}

#[cfg(feature = "explorer")]
impl ExplorableKey for GvaUtxoIdDbV1 {
    fn from_explorer_str(_: &str) -> std::result::Result<Self, StringErr> {
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
    fn utxo_id_v2_as_bytes() -> std::result::Result<(), StringErr> {
        let utxo_id = UtxoIdDbV2(Hash::default(), 3);

        let utxo_id_2_res = utxo_id.as_bytes(|bytes| {
            assert_eq!(
                bytes,
                [
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 3
                ]
            );
            UtxoIdDbV2::from_bytes(bytes)
        });

        assert_eq!(utxo_id_2_res?, utxo_id);

        Ok(())
    }

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

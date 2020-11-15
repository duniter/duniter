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
}

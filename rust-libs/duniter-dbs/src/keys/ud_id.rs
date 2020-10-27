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

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub struct UdIdV2(pub PublicKey, pub BlockNumber);

impl PartialOrd for UdIdV2 {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        match self.0.partial_cmp(&other.0) {
            Some(std::cmp::Ordering::Equal) => self.1.partial_cmp(&other.1),
            o => o,
        }
    }
}
impl Ord for UdIdV2 {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        match self.0.cmp(&other.0) {
            std::cmp::Ordering::Equal => self.1.cmp(&other.1),
            o => o,
        }
    }
}

impl KeyAsBytes for UdIdV2 {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        let mut buffer = uninit_array![u8; 37];
        let (pubkey_buffer, block_number_buffer) = buffer.as_out().split_at_out(33);
        let pubkey_buffer = pubkey_buffer.copy_from_slice(self.0.as_ref());
        block_number_buffer.copy_from_slice(&(self.1).0.to_be_bytes());
        f(unsafe { std::slice::from_raw_parts_mut(pubkey_buffer.as_mut_ptr(), 37) })
    }
}

impl FromBytes for UdIdV2 {
    type Err = StringErr;

    fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
        let pubkey = PublicKey::try_from(&bytes[..33])
            .map_err(|e| StringErr(format!("{}: {:?}", e, bytes)))?;
        let block_number = BlockNumber(
            zerocopy::LayoutVerified::<_, zerocopy::U32<byteorder::BigEndian>>::new(&bytes[33..])
                .ok_or_else(|| {
                    StringErr(
                        "Corrupted DB: BlockNumber bytes are invalid length or unaligned"
                            .to_owned(),
                    )
                })?
                .get(),
        );
        Ok(UdIdV2(pubkey, block_number))
    }
}

impl ToDumpString for UdIdV2 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}

#[cfg(feature = "explorer")]
impl ExplorableKey for UdIdV2 {
    fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
        let mut source = source.split(':');
        if let Some(pubkey_str) = source.next() {
            let pubkey = PublicKey::from_base58(&pubkey_str)
                .map_err(|e| StringErr(format!("{}: {}", e, pubkey_str)))?;
            if let Some(block_number_str) = source.next() {
                Ok(UdIdV2(
                    pubkey,
                    BlockNumber::from_str(block_number_str)
                        .map_err(|e| StringErr(format!("{}", e)))?,
                ))
            } else {
                Err(StringErr("UdIdV2: Invalid format".to_owned()))
            }
        } else {
            Err(StringErr("UdIdV2: Invalid format".to_owned()))
        }
    }
    fn to_explorer_string(&self) -> KvResult<String> {
        Ok(format!("{}:{}", self.0.to_base58(), (self.1).0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ud_id_v2_as_bytes() -> std::result::Result<(), StringErr> {
        let ud_id = UdIdV2(PublicKey::default(), BlockNumber(3));

        let ud_id_2_res = ud_id.as_bytes(|bytes| {
            assert_eq!(
                bytes,
                [
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 32, 0, 0, 0, 3
                ]
            );
            UdIdV2::from_bytes(bytes)
        });

        assert_eq!(ud_id_2_res?, ud_id);

        Ok(())
    }
}

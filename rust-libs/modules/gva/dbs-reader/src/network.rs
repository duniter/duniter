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
use dubp::crypto::keys::PublicKey as _;
use duniter_dbs::databases::dunp_v1::DunpV1DbReadable;
use duniter_dbs::{DunpHeadDbV1, PeerCardDbV1};

#[allow(clippy::unnecessary_wraps)]
impl DbsReaderImpl {
    pub(super) fn peers_and_heads_<DB: DunpV1DbReadable>(
        &self,
        dunp_db: &DB,
    ) -> KvResult<Vec<(PeerCardDbV1, Vec<DunpHeadDbV1>)>> {
        Ok(dunp_db.peers_old().iter(.., |it| {
            it.values()
                .filter_map(|peer_res| {
                    if let Ok(peer) = peer_res {
                        if let Ok(pubkey) = PublicKey::from_base58(&peer.pubkey) {
                            let k_min = duniter_dbs::DunpNodeIdV1Db::new(0, pubkey);
                            let k_max = duniter_dbs::DunpNodeIdV1Db::new(u32::MAX, pubkey);
                            Some((
                                peer,
                                dunp_db.heads_old().iter(k_min..k_max, |it| {
                                    it.values().filter_map(|head| head.ok()).collect()
                                }),
                            ))
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                })
                .collect()
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use duniter_dbs::databases::dunp_v1::DunpV1DbWritable;

    #[test]
    fn test_peers_and_heads() -> KvResult<()> {
        let dunp_db = duniter_dbs::databases::dunp_v1::DunpV1Db::<Mem>::open(MemConf::default())?;
        let db_reader = DbsReaderImpl::mem();
        let pk = PublicKey::default();

        dunp_db.peers_old_write().upsert(
            PubKeyKeyV2(pk),
            PeerCardDbV1 {
                pubkey: pk.to_string(),
                ..Default::default()
            },
        )?;
        dunp_db.heads_old_write().upsert(
            duniter_dbs::DunpNodeIdV1Db::new(42, pk),
            DunpHeadDbV1::default(),
        )?;
        dunp_db.heads_old_write().upsert(
            duniter_dbs::DunpNodeIdV1Db::new(43, pk),
            DunpHeadDbV1 {
                pubkey: PublicKey::from_base58("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
                    .expect("invalid pubkey"),
                ..Default::default()
            },
        )?;

        assert_eq!(
            db_reader.peers_and_heads(&dunp_db)?,
            vec![(
                PeerCardDbV1 {
                    pubkey: pk.to_string(),
                    ..Default::default()
                },
                vec![
                    DunpHeadDbV1::default(),
                    DunpHeadDbV1 {
                        pubkey: PublicKey::from_base58("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
                            .expect("invalid pubkey"),
                        ..Default::default()
                    }
                ]
            )]
        );

        Ok(())
    }
}

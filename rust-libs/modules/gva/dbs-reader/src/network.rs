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
use duniter_dbs::{databases::network_v1::NetworkV1DbReadable, DunpHeadDbV1, PeerCardDbV1};

#[allow(clippy::unnecessary_wraps)]
impl DbsReaderImpl {
    pub(super) fn endpoints_<DB: NetworkV1DbReadable>(
        &self,
        network_db: &DB,
        mut api_list: Vec<String>,
    ) -> KvResult<Vec<String>> {
        if api_list.is_empty() {
            return Ok(vec![]);
        }
        for api in &mut api_list {
            api.push(' ');
        }
        network_db.peers_old().iter(.., |it| {
            it.values()
                .map_ok(|peer| {
                    peer.endpoints.into_iter().filter(|endpoint| {
                        api_list
                            .iter()
                            .any(|api| endpoint.starts_with(api.as_str()))
                    })
                })
                .flatten_ok()
                .collect::<Result<Vec<String>, _>>()
        })
    }
    pub(super) fn peers_and_heads_<DB: NetworkV1DbReadable>(
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
    use duniter_dbs::databases::network_v1::NetworkV1DbWritable;
    use duniter_dbs::PeerCardDbV1;

    #[test]
    fn test_empty_endpoints() -> KvResult<()> {
        // Populate DB
        let dunp_db =
            duniter_dbs::databases::network_v1::NetworkV1Db::<Mem>::open(MemConf::default())?;
        let db_reader = DbsReaderImpl::mem();
        let pk = PublicKey::default();

        dunp_db
            .peers_old_write()
            .upsert(PubKeyKeyV2(pk), PeerCardDbV1::default())?;

        // Request Data
        let api_list = vec!["GVA".to_owned()];
        assert_eq!(
            db_reader.endpoints_(&dunp_db, api_list)?,
            Vec::<String>::new()
        );

        Ok(())
    }
    #[test]
    fn test_endpoints_with_empty_api_list() -> KvResult<()> {
        let dummy_endpoint = "GVA S domain.tld 443 gva";

        // Populate DB
        let dunp_db =
            duniter_dbs::databases::network_v1::NetworkV1Db::<Mem>::open(MemConf::default())?;
        let db_reader = DbsReaderImpl::mem();
        let pk = PublicKey::default();
        let peer = PeerCardDbV1 {
            endpoints: vec![dummy_endpoint.to_owned()],
            ..Default::default()
        };

        dunp_db.peers_old_write().upsert(PubKeyKeyV2(pk), peer)?;

        // Request Data
        let api_list = vec![];
        assert_eq!(
            db_reader.endpoints_(&dunp_db, api_list)?,
            Vec::<String>::new()
        );

        Ok(())
    }
    #[test]
    fn test_single_peer_endpoints() -> KvResult<()> {
        let dummy_endpoint = "GVA S domain.tld 443 gva";

        // Populate DB
        let dunp_db =
            duniter_dbs::databases::network_v1::NetworkV1Db::<Mem>::open(MemConf::default())?;
        let db_reader = DbsReaderImpl::mem();
        let pk = PublicKey::default();
        let peer = PeerCardDbV1 {
            endpoints: vec![dummy_endpoint.to_owned()],
            ..Default::default()
        };

        dunp_db.peers_old_write().upsert(PubKeyKeyV2(pk), peer)?;

        // Request Data
        let api_list = vec!["GVA".to_owned()];
        assert_eq!(
            db_reader.endpoints_(&dunp_db, api_list)?,
            vec![dummy_endpoint.to_owned()]
        );

        Ok(())
    }

    #[test]
    fn test_peers_and_heads() -> KvResult<()> {
        let dunp_db =
            duniter_dbs::databases::network_v1::NetworkV1Db::<Mem>::open(MemConf::default())?;
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

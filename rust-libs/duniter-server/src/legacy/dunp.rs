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

impl DuniterServer {
    pub fn receive_new_heads(
        &self,
        heads: Vec<(duniter_dbs::DunpNodeIdV1Db, duniter_dbs::DunpHeadDbV1)>,
    ) -> KvResult<()> {
        self.dbs_pool
            .execute(move |dbs| {
                for (dunp_node_id, dunp_head) in heads {
                    dbs.dunp_db
                        .heads_old_write()
                        .upsert(dunp_node_id, dunp_head)?
                }
                Ok::<(), KvError>(())
            })
            .expect("dbs pool disconnected")
    }
    pub fn remove_all_peers(&self) -> KvResult<()> {
        use duniter_dbs::databases::dunp_v1::DunpV1DbWritable as _;
        self.dbs_pool
            .execute(move |dbs| dbs.dunp_db.peers_old_write().clear())
            .expect("dbs pool disconnected")
    }
    pub fn remove_peer_by_pubkey(&self, pubkey: PublicKey) -> KvResult<()> {
        use duniter_dbs::databases::dunp_v1::DunpV1DbWritable as _;
        self.dbs_pool
            .execute(move |dbs| dbs.dunp_db.peers_old_write().remove(PubKeyKeyV2(pubkey)))
            .expect("dbs pool disconnected")
    }
    pub fn save_peer(&self, new_peer_card: PeerCardDbV1) -> anyhow::Result<()> {
        use dubp::crypto::keys::PublicKey as _;
        let pubkey = PublicKey::from_base58(&new_peer_card.pubkey)?;
        use duniter_dbs::databases::dunp_v1::DunpV1DbWritable as _;
        self.dbs_pool
            .execute(move |dbs| {
                dbs.dunp_db.peers_old_write().upsert(
                    PubKeyKeyV2(pubkey),
                    duniter_dbs::PeerCardDbV1 {
                        version: new_peer_card.version,
                        currency: new_peer_card.currency,
                        pubkey: new_peer_card.pubkey,
                        blockstamp: new_peer_card.blockstamp,
                        endpoints: new_peer_card.endpoints,
                        status: new_peer_card.status,
                        signature: new_peer_card.signature,
                    },
                )
            })
            .expect("dbs pool disconnected")
            .map_err(|e| e.into())
    }
    pub fn update_self_peer(&self, new_peer_card: PeerCardDbV1) {
        self.dbs_pool
            .execute(move |dbs| {
                dbs.cm_db
                    .self_peer_old_write()
                    .upsert((), new_peer_card)
                    .expect("fail to write on memory db")
            })
            .expect("dbs pool disconnected")
    }
}

#[cfg(test)]
mod tests {
    use dubp::crypto::keys::{
        ed25519::{PublicKey, Signature},
        PublicKey as _,
    };
    use duniter_dbs::databases::dunp_v1::DunpV1DbReadable;
    use duniter_dbs::PeerCardDbV1;

    use super::*;

    #[test]
    fn test_receive_new_heads() -> anyhow::Result<()> {
        let server = DuniterServer::test(DuniterConf::default(), DuniterMode::Start)?;
        let dbs = server.get_shared_dbs();

        let head = (
            duniter_dbs::DunpNodeIdV1Db::new(53, PublicKey::default()),
            duniter_dbs::DunpHeadDbV1 {
                api: "WS2P".to_owned(),
                pubkey: PublicKey::default(),
                blockstamp: Blockstamp::default(),
                software: duniter_module::SOFTWARE_NAME.to_owned(),
                software_version: "test".to_owned(),
                pow_prefix: 1,
                free_member_room: 0,
                free_mirror_room: 0,
                signature: Signature::default(),
            },
        );

        assert_eq!(dbs.dunp_db.heads_old().count()?, 0);
        server.receive_new_heads(vec![head.clone()])?;
        assert_eq!(dbs.dunp_db.heads_old().count()?, 1);
        assert_eq!(dbs.dunp_db.heads_old().get(&head.0)?, Some(head.1));

        Ok(())
    }

    #[test]
    fn test_save_peer() -> anyhow::Result<()> {
        use duniter_dbs::databases::dunp_v1::DunpV1DbReadable as _;
        let server = DuniterServer::test(DuniterConf::default(), DuniterMode::Start)?;
        let dbs = server.get_shared_dbs();

        let peer = PeerCardDbV1 {
            version: 0,
            currency: "test".to_owned(),
            pubkey: "82NdD9eEbXSjRJXeJdqf56xkpu6taTfTeEqtAtmtbyXY".to_owned(),
            blockstamp: "379922-0000001D97770A8203062F9E618F29FFAA2EF4218649FCE6DD13E01C3932E943".to_owned(),
            endpoints: vec![],
            status: "UP".to_owned(),
            signature: "KBaoJuKIfkWJO015BTegUN8l81VYPfleVUfQUwPRPAAF1oB398hDb1bX/QUFe+3CKFz57aGT8bB745mz90x5Ag==".to_owned(),
        };
        let pubkey = PublicKey::from_base58(&peer.pubkey)?;

        assert_eq!(dbs.dunp_db.peers_old().count()?, 0);
        server.save_peer(peer.clone())?;

        assert_eq!(dbs.dunp_db.peers_old().count()?, 1);
        let peer_db = dbs.dunp_db.peers_old().get(&PubKeyKeyV2(pubkey))?;

        assert_eq!(peer_db, Some(peer));

        Ok(())
    }
}

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
    pub fn get_self_endpoints(&self) -> anyhow::Result<Vec<Endpoint>> {
        // Do not get rust endpoints on js tests or when gva is disabled
        if std::env::var_os("DUNITER_JS_TESTS") != Some("yes".into()) {
            let (sender, recv) = flume::bounded(1);
            loop {
                self.global_sender
                    .send(GlobalBackGroundTaskMsg::GetSelfEndpoints(sender.clone()))?;
                if let Some(self_endpoints) = recv.recv()? {
                    break Ok(self_endpoints);
                } else {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
            }
        } else {
            Ok(vec![])
        }
    }
    pub fn receive_new_heads(
        &self,
        heads: Vec<(
            duniter_core::dbs::DunpNodeIdV1Db,
            duniter_core::dbs::DunpHeadDbV1,
        )>,
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
        use duniter_core::dbs::databases::network_v1::NetworkV1DbWritable as _;
        self.dbs_pool
            .execute(move |dbs| dbs.dunp_db.peers_old_write().clear())
            .expect("dbs pool disconnected")
    }
    pub fn remove_peer_by_pubkey(&self, pubkey: PublicKey) -> KvResult<()> {
        use duniter_core::dbs::databases::network_v1::NetworkV1DbWritable as _;
        self.dbs_pool
            .execute(move |dbs| dbs.dunp_db.peers_old_write().remove(PubKeyKeyV2(pubkey)))
            .expect("dbs pool disconnected")
    }
    pub fn save_peer(&self, new_peer_card: PeerCardDbV1) -> anyhow::Result<()> {
        let pubkey = new_peer_card.peer.pubkey;
        use duniter_core::dbs::databases::network_v1::NetworkV1DbWritable as _;
        self.dbs_pool
            .execute(move |dbs| {
                dbs.dunp_db
                    .peers_old_write()
                    .upsert(PubKeyKeyV2(pubkey), new_peer_card)
            })
            .expect("dbs pool disconnected")
            .map_err(|e| e.into())
    }
    pub fn update_self_peer(&self, new_peer_card: PeerCardDbV1) {
        self.global_sender
            .send(GlobalBackGroundTaskMsg::SetSelfPeerOld(new_peer_card))
            .expect("global task disconnected");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use duniter_core::dbs::databases::network_v1::NetworkV1DbReadable;
    use duniter_core::dbs::PeerCardDbV1;
    use duniter_core::{
        crypto::keys::{
            ed25519::{PublicKey, Signature},
            PublicKey as _, Signature as _,
        },
        peer::PeerV10,
    };
    use std::str::FromStr;

    #[test]
    fn test_receive_new_heads() -> anyhow::Result<()> {
        let server = DuniterServer::test(DuniterCoreConf::default(), DuniterMode::Start)?;
        let dbs = server.get_shared_dbs();

        let head = (
            duniter_core::dbs::DunpNodeIdV1Db::new(53, PublicKey::default()),
            duniter_core::dbs::DunpHeadDbV1 {
                api: "WS2P".to_owned(),
                pubkey: PublicKey::default(),
                blockstamp: Blockstamp::default(),
                software: duniter_core::module::SOFTWARE_NAME.to_owned(),
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
        use duniter_core::dbs::databases::network_v1::NetworkV1DbReadable as _;
        let server = DuniterServer::test(DuniterCoreConf::default(), DuniterMode::Start)?;
        let dbs = server.get_shared_dbs();

        let peer_db = PeerCardDbV1 {
            peer: PeerV10 {
                currency: "test".to_owned(),
                pubkey: PublicKey::from_base58("82NdD9eEbXSjRJXeJdqf56xkpu6taTfTeEqtAtmtbyXY")?,
                blockstamp: Blockstamp::from_str("379922-0000001D97770A8203062F9E618F29FFAA2EF4218649FCE6DD13E01C3932E943")?,
                endpoints: duniter_core::dbs::smallvec::SmallVec::new(),
                signature: Signature::from_base64("KBaoJuKIfkWJO015BTegUN8l81VYPfleVUfQUwPRPAAF1oB398hDb1bX/QUFe+3CKFz57aGT8bB745mz90x5Ag==")?,
            },
            status: true,
            member: false,
        };
        let pubkey = peer_db.peer.pubkey;

        assert_eq!(dbs.dunp_db.peers_old().count()?, 0);
        server.save_peer(peer_db.clone())?;

        assert_eq!(dbs.dunp_db.peers_old().count()?, 1);
        let peer_db_opt = dbs.dunp_db.peers_old().get(&PubKeyKeyV2(pubkey))?;

        assert_eq!(peer_db_opt, Some(peer_db));

        Ok(())
    }
}

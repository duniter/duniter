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

#[derive(Default, async_graphql::SimpleObject)]
#[graphql(name = "Peer")]
pub struct PeerCardGva {
    pub version: u32,
    pub currency: String,
    pub pubkey: String,
    pub blockstamp: String,
    pub endpoints: Vec<String>,
    pub status: String,
    pub signature: String,
}
impl From<duniter_dbs::PeerCardDbV1> for PeerCardGva {
    fn from(peer: duniter_dbs::PeerCardDbV1) -> Self {
        Self {
            version: peer.version,
            currency: peer.currency,
            pubkey: peer.pubkey,
            blockstamp: peer.blockstamp,
            endpoints: peer.endpoints,
            status: peer.status,
            signature: peer.signature,
        }
    }
}

#[derive(Default, async_graphql::SimpleObject)]
#[graphql(name = "Head")]
pub struct HeadGva {
    pub api: String,
    pub pubkey: String,
    pub blockstamp: String,
    pub software: String,
    pub software_version: String,
    pub pow_prefix: u32,
    pub free_member_room: u32,
    pub free_mirror_room: u32,
    pub signature: String,
}
impl From<duniter_dbs::DunpHeadDbV1> for HeadGva {
    fn from(head: duniter_dbs::DunpHeadDbV1) -> Self {
        Self {
            api: head.api,
            pubkey: head.pubkey.to_string(),
            blockstamp: head.blockstamp.to_string(),
            software: head.software,
            software_version: head.software_version,
            pow_prefix: head.pow_prefix,
            free_member_room: head.free_member_room,
            free_mirror_room: head.free_member_room,
            signature: head.signature.to_string(),
        }
    }
}

#[derive(async_graphql::SimpleObject)]
pub(crate) struct PeerWithHeads {
    pub peer: PeerCardGva,
    pub heads: Vec<HeadGva>,
}

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

use duniter_dbs::BlockMetaV2;

#[derive(async_graphql::SimpleObject)]
pub(crate) struct Block {
    pub version: u64,
    pub number: u32,
    pub hash: String,
    pub signature: String,
    pub inner_hash: String,
    pub previous_hash: String,
    pub issuer: String,
    pub time: u64,
    pub pow_min: u32,
    pub members_count: u64,
    pub issuers_count: u32,
    pub issuers_frame: u64,
    pub median_time: u64,
    pub nonce: u64,
    pub monetary_mass: u64,
    pub unit_base: u32,
    pub dividend: Option<u32>,
}

impl From<BlockMetaV2> for Block {
    fn from(block_db: BlockMetaV2) -> Self {
        Block {
            version: block_db.version,
            number: block_db.number,
            hash: block_db.hash.to_string(),
            signature: block_db.signature.to_string(),
            inner_hash: block_db.inner_hash.to_string(),
            previous_hash: block_db.previous_hash.to_string(),
            issuer: block_db.issuer.to_string(),
            time: block_db.time,
            pow_min: block_db.pow_min,
            members_count: block_db.members_count,
            issuers_count: block_db.issuers_count,
            issuers_frame: block_db.issuers_frame,
            median_time: block_db.median_time,
            nonce: block_db.nonce,
            monetary_mass: block_db.monetary_mass,
            unit_base: block_db.unit_base,
            dividend: block_db.dividend.map(|sa| sa.amount() as u32),
        }
    }
}

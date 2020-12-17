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

use super::tx_gva::TxGva;
use crate::*;
use dubp::block::DubpBlockV10;
use duniter_dbs::BlockMetaV2;

#[derive(async_graphql::SimpleObject)]
pub(crate) struct BlockMeta {
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

impl From<BlockMetaV2> for BlockMeta {
    fn from(block_db: BlockMetaV2) -> Self {
        Self::from(&block_db)
    }
}
impl From<&BlockMetaV2> for BlockMeta {
    fn from(block_db: &BlockMetaV2) -> Self {
        BlockMeta {
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

#[derive(async_graphql::SimpleObject)]
pub(crate) struct Block {
    // Meta
    pub version: u64,
    pub number: u32,
    pub hash: String,
    pub signature: String,
    pub inner_hash: String,
    pub previous_hash: Option<String>,
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
    // Payload
    /// Identities
    pub identities: Vec<String>,
    /// joiners
    pub joiners: Vec<String>,
    /// Actives (=renewals)
    pub actives: Vec<String>,
    /// Leavers
    pub leavers: Vec<String>,
    /// Revokeds
    pub revoked: Vec<String>,
    /// Excludeds
    pub excluded: Vec<String>,
    /// Certifications
    pub certifications: Vec<String>,
    pub transactions: Vec<TxGva>,
}

impl From<&DubpBlockV10> for Block {
    fn from(block: &DubpBlockV10) -> Self {
        let block = block.to_string_object();
        Block {
            // Meta
            version: block.version,
            number: block.number as u32,
            hash: block.hash.unwrap_or_default(),
            signature: block.signature,
            inner_hash: block.inner_hash.unwrap_or_default(),
            previous_hash: block.previous_hash,
            issuer: block.issuer,
            time: block.time,
            pow_min: block.pow_min as u32,
            members_count: block.members_count,
            issuers_count: block.issuers_count as u32,
            issuers_frame: block.issuers_frame,
            median_time: block.median_time,
            nonce: block.nonce,
            monetary_mass: block.monetary_mass,
            unit_base: block.unit_base as u32,
            dividend: block.dividend.map(|amount| amount as u32),
            // Payload
            identities: block.identities,
            joiners: block.joiners,
            actives: block.actives,
            leavers: block.leavers,
            revoked: block.revoked,
            excluded: block.excluded,
            certifications: block.certifications,
            transactions: block.transactions.into_iter().map(Into::into).collect(),
        }
    }
}

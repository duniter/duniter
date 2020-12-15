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
use dubp::crypto::keys::ed25519::PublicKey;
use duniter_dbs::BlockDbV2;

pub fn apply_block(block: &DubpBlockV10, cm_db: &CmV1Db<MemSingleton>) -> KvResult<()> {
    let block_meta = BlockMetaV2 {
        version: 10,
        number: block.number().0,
        hash: block.hash().0,
        signature: block.signature(),
        inner_hash: block.inner_hash(),
        previous_hash: block.previous_hash(),
        issuer: block.issuer(),
        previous_issuer: PublicKey::default(),
        time: block.local_time(),
        pow_min: block.pow_min() as u32,
        members_count: block.members_count() as u64,
        issuers_count: block.issuers_count() as u32,
        issuers_frame: block.issuers_frame() as u64,
        issuers_frame_var: 0,
        median_time: block.common_time(),
        nonce: block.nonce(),
        monetary_mass: block.monetary_mass(),
        dividend: block.dividend(),
        unit_base: block.unit_base() as u32,
    };
    cm_db.current_block_meta_write().upsert((), block_meta)?;
    cm_db
        .current_block_write()
        .upsert((), BlockDbV2(block.clone()))?;
    Ok(())
}

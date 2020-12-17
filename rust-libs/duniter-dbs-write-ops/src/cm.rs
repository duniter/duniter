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
use duniter_dbs::databases::bc_v2::BcV2DbReadable;
use duniter_dbs::BlockDbV2;

pub fn init(bc_db: &BcV2Db<FileBackend>, cm_db: &CmV1Db<MemSingleton>) -> KvResult<()> {
    if let Some(current_block_meta) = bc_db
        .blocks_meta()
        .iter_rev(.., |it| it.values().next_res())?
    {
        cm_db
            .current_block_meta_write()
            .upsert((), current_block_meta)
    } else {
        Ok(())
    }
}

pub fn apply_block(block: &DubpBlockV10, cm_db: &CmV1Db<MemSingleton>) -> KvResult<()> {
    let block_meta = BlockMetaV2::from(block);
    cm_db.current_block_meta_write().upsert((), block_meta)?;
    cm_db
        .current_block_write()
        .upsert((), BlockDbV2(block.clone()))?;
    Ok(())
}

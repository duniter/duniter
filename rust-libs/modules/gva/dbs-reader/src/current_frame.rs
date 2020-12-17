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

use crate::*;

impl DbsReader {
    pub fn get_current_frame<BcDb: BcV2DbReadable, CmDb: CmV1DbReadable>(
        &self,
        bc_db: &BcDb,
        cm_db: &CmDb,
    ) -> anyhow::Result<Vec<BlockMetaV2>> {
        if let Some(current_block) = self.get_current_block(cm_db)? {
            let issuers_frame = current_block.issuers_frame;
            let start = U32BE(current_block.number + 1 - issuers_frame as u32);
            bc_db
                .blocks_meta()
                .iter_rev(start.., |it| it.values().collect::<KvResult<_>>())
                .map_err(Into::into)
        } else {
            Ok(Vec::with_capacity(0))
        }
    }
}

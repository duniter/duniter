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

impl DbsReaderImpl {
    pub(super) fn get_current_frame_<BcDb: 'static + BcV2DbReadable>(
        &self,
        bc_db: &BcDb,
        current_block_meta: &BlockMetaV2,
    ) -> anyhow::Result<Vec<BlockMetaV2>> {
        let issuers_frame = current_block_meta.issuers_frame;
        let start = U32BE(current_block_meta.number + 1 - issuers_frame as u32);
        bc_db
            .blocks_meta()
            .iter_rev(start.., |it| it.values().collect::<KvResult<_>>())
            .map_err(Into::into)
    }
}

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
use dubp::block::prelude::*;

pub(super) async fn exec_req_members_count(
    bca_executor: &BcaExecutor,
) -> Result<BcaRespTypeV0, ExecReqTypeError> {
    let dbs_reader = bca_executor.dbs_reader();
    Ok(bca_executor
        .dbs_pool
        .execute(move |dbs| match dbs_reader.get_current_block(&dbs.cm_db) {
            Ok(Some(current_block)) => {
                BcaRespTypeV0::MembersCount(current_block.members_count() as u64)
            }
            Ok(None) => BcaRespTypeV0::Error("no blockchain".to_owned()),
            Err(e) => BcaRespTypeV0::Error(e.to_string()),
        })
        .await?)
}

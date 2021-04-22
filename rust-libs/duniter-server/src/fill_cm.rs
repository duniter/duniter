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
use dubp::wallet::prelude::SourceAmount;
use duniter_core::dbs::databases::bc_v2::BcV2DbReadable;
use duniter_core::global::{CurrentMeta, GlobalBackGroundTaskMsg};

pub(super) fn fill_and_get_current_meta<BcDb: BcV2DbReadable>(
    bc_db_ro: &BcDb,
    global_sender: &flume::Sender<GlobalBackGroundTaskMsg>,
) -> anyhow::Result<Option<BlockMetaV2>> {
    if let Some(current_block_meta) = bc_db_ro
        .blocks_meta()
        .iter_rev(.., |it| it.values().next_res())?
    {
        if let Some(current_ud) = bc_db_ro
            .uds_reval()
            .iter_rev(.., |it| it.values().map_ok(|v| v.0).next_res())?
        {
            global_sender.send(GlobalBackGroundTaskMsg::InitCurrentMeta(CurrentMeta {
                current_ud,
                current_block_meta,
            }))?;
        } else {
            global_sender.send(GlobalBackGroundTaskMsg::InitCurrentMeta(CurrentMeta {
                current_ud: SourceAmount::ZERO,
                current_block_meta,
            }))?;
        }
        Ok(Some(current_block_meta))
    } else {
        Ok(None)
    }
}

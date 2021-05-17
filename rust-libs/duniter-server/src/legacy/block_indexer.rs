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
    pub fn apply_block(&mut self, block: DubpBlockV10Stringified) -> KvResult<()> {
        let block = Arc::new(
            DubpBlockV10::from_string_object(&block).map_err(|e| KvError::DeserError(e.into()))?,
        );

        // Get currency parameters from genesis block
        if let Some(currency_params) = block.currency_parameters() {
            self.currency_params = currency_params;
        }

        self.current = Some(duniter_core::dbs_write_ops::apply_block::apply_block(
            &self.bc_db,
            block.clone(),
            self.current,
            &self.dbs_pool,
            &self.global_sender,
            false,
        )?);
        apply_block_modules(
            block,
            Arc::new(self.conf.clone()),
            self.currency_params,
            &self.dbs_pool,
            None,
        )
    }
    pub fn apply_chunk_of_blocks(&mut self, blocks: Vec<DubpBlockV10Stringified>) -> KvResult<()> {
        log::debug!("apply_chunk(#{})", blocks[0].number);

        let blocks = Arc::from(
            blocks
                .into_iter()
                .map(|block| DubpBlockV10::from_string_object(&block))
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| KvError::DeserError(e.into()))?,
        );

        // Get currency parameters from genesis block
        if let Some(currency_params) = blocks[0].currency_parameters() {
            self.currency_params = currency_params;
        }

        self.current = Some(duniter_core::dbs_write_ops::apply_block::apply_chunk(
            &self.bc_db,
            self.current,
            &self.dbs_pool,
            blocks.clone(),
            Some(&self.global_sender),
        )?);
        apply_chunk_of_blocks_modules(
            blocks,
            Arc::new(self.conf.clone()),
            self.currency_params,
            &self.dbs_pool,
            None,
        )
    }
    pub fn revert_block(&mut self, block: DubpBlockV10Stringified) -> KvResult<()> {
        let block = Arc::new(
            DubpBlockV10::from_string_object(&block).map_err(|e| KvError::DeserError(e.into()))?,
        );
        let block_arc_clone = Arc::clone(&block);
        let txs_mp_job_handle = self
            .dbs_pool
            .launch(move |dbs| {
                duniter_core::dbs_write_ops::txs_mp::revert_block(
                    block_arc_clone.transactions(),
                    &dbs.txs_mp_db,
                )
            })
            .expect("dbs pool disconnected");
        self.current = duniter_core::dbs_write_ops::bc::revert_block(&self.bc_db, &block)?;
        txs_mp_job_handle.join().expect("dbs pool disconnected")?;
        revert_block_modules(
            block,
            Arc::new(self.conf.clone()),
            self.currency_params,
            &self.dbs_pool,
            None,
        )
    }
}

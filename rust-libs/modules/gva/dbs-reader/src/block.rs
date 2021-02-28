//  Copyright (C) 2021 Pascal Engélibert
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

#[derive(Clone, Copy, Debug, Default, Eq, Ord, PartialEq, PartialOrd)]
pub struct BlockCursor {
    pub number: BlockNumber,
}
impl std::fmt::Display for BlockCursor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.number)
    }
}

impl FromStr for BlockCursor {
    type Err = WrongCursor;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(Self {
            number: s.parse().map_err(|_| WrongCursor)?,
        })
    }
}

impl DbsReader {
    pub fn block(
        &self,
        bc_db: &BcV2DbRo<FileBackend>,
        number: U32BE,
    ) -> KvResult<Option<duniter_dbs::BlockMetaV2>> {
        bc_db.blocks_meta().get(&number)
    }

    pub fn blocks(
        &self,
        bc_db: &BcV2DbRo<FileBackend>,
        page_info: PageInfo<BlockCursor>,
    ) -> KvResult<PagedData<Vec<(BlockCursor, duniter_dbs::BlockMetaV2)>>> {
        let last_block_number = bc_db
            .blocks_meta()
            .iter_rev(.., |it| it.values().next_res())?
            .ok_or_else(|| KvError::Custom("Empty blockchain".into()))?
            .number;

        let first_cursor_opt = if page_info.not_all() {
            Some(BlockCursor {
                number: BlockNumber(0),
            })
        } else {
            None
        };

        let last_cursor_opt = if page_info.not_all() {
            Some(BlockCursor {
                number: BlockNumber(last_block_number),
            })
        } else {
            None
        };

        let k_min = U32BE(if page_info.order {
            page_info.pos.map_or_else(|| 0, |pos| pos.number.0)
        } else {
            page_info.limit_opt.map_or_else(
                || 0,
                |limit| {
                    page_info
                        .pos
                        .map_or_else(last_block_number + 1, |pos| pos.number.0)
                        .saturating_sub(limit.get() as u32 - 1)
                },
            )
        });
        let k_max = U32BE(if page_info.order {
            page_info.limit_opt.map_or_else(
                || last_block_number + 1,
                |limit| {
                    page_info.pos.map_or_else(
                        || limit.get() as u32,
                        |pos| pos.number.0.saturating_add(limit.get() as u32),
                    )
                },
            )
        } else {
            page_info.pos.map_or_else(
                || last_block_number + 1,
                |pos| pos.number.0.saturating_add(1),
            )
        });

        let blocks: Vec<(BlockCursor, duniter_dbs::BlockMetaV2)> = if page_info.order {
            bc_db.blocks_meta().iter(k_min..k_max, blocks_inner)?
        } else {
            bc_db.blocks_meta().iter_rev(k_min..k_max, blocks_inner)?
        };

        Ok(PagedData {
            has_next_page: has_next_page(
                blocks
                    .iter()
                    .map(|(block_cursor, _block)| block_cursor.into()),
                last_cursor_opt,
                page_info,
                page_info.order,
            ),
            has_previous_page: has_previous_page(
                blocks
                    .iter()
                    .map(|(block_cursor, _block)| block_cursor.into()),
                first_cursor_opt,
                page_info,
                page_info.order,
            ),
            data: blocks,
        })
    }
}

fn blocks_inner<I>(blocks_iter: I) -> KvResult<Vec<(BlockCursor, duniter_dbs::BlockMetaV2)>>
where
    I: Iterator<Item = KvResult<(U32BE, BlockMetaV2)>>,
{
    blocks_iter
        .map(|block_res| {
            block_res.map(|block| {
                (
                    BlockCursor {
                        number: BlockNumber(block.0 .0),
                    },
                    block.1,
                )
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use duniter_dbs::databases::bc_v2::BcV2DbWritable;
    use duniter_gva_db::GvaV1DbWritable;
    use std::num::NonZeroUsize;

    #[test]
    fn test_block() -> KvResult<()> {
        let bc_db = duniter_dbs::databases::bc_v2::BcV2Db::<Mem>::open(MemConf::default())?;
        let gva_db = duniter_gva_db::GvaV1Db::<Mem>::open(MemConf::default())?;
        let bc_db_ro = bc_db.get_ro_handler();
        let db_reader = create_dbs_reader(unsafe { std::mem::transmute(&gva_db.get_ro_handler()) });

        bc_db
            .blocks_meta_write()
            .upsert(U32BE(0), duniter_dbs::BlockMetaV2::default())?;

        assert_eq!(
            db_reader.block(&bc_db_ro, U32BE(0))?,
            Some(duniter_dbs::BlockMetaV2::default())
        );

        Ok(())
    }

    #[test]
    fn test_blocks() -> KvResult<()> {
        let bc_db = duniter_dbs::databases::bc_v2::BcV2Db::<Mem>::open(MemConf::default())?;
        let gva_db = duniter_gva_db::GvaV1Db::<Mem>::open(MemConf::default())?;
        let bc_db_ro = bc_db.get_ro_handler();
        let db_reader = create_dbs_reader(unsafe { std::mem::transmute(&gva_db.get_ro_handler()) });

        for i in 0..20 {
            bc_db.blocks_meta_write().upsert(
                U32BE(i),
                duniter_dbs::BlockMetaV2 {
                    number: i,
                    ..Default::default()
                },
            )?;
        }

        let blocks = db_reader.blocks(
            &bc_db_ro,
            PageInfo {
                pos: Some(BlockCursor {
                    number: BlockNumber(10),
                }),
                order: true,
                limit_opt: NonZeroUsize::new(3),
            },
        )?;

        assert_eq!(blocks.data.len(), 3);
        assert_eq!(blocks.data[0].1.number, 10);
        assert_eq!(blocks.data[1].1.number, 11);
        assert_eq!(blocks.data[2].1.number, 12);
        assert!(blocks.has_previous_page);
        assert!(blocks.has_next_page);

        let blocks = db_reader.blocks(
            &bc_db_ro,
            PageInfo {
                pos: Some(BlockCursor {
                    number: BlockNumber(10),
                }),
                order: false,
                limit_opt: NonZeroUsize::new(3),
            },
        )?;

        assert_eq!(blocks.data.len(), 3);
        assert_eq!(blocks.data[0].1.number, 10);
        assert_eq!(blocks.data[1].1.number, 9);
        assert_eq!(blocks.data[2].1.number, 8);
        assert!(blocks.has_previous_page);
        assert!(blocks.has_next_page);

        Ok(())
    }
}

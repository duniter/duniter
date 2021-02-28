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
use duniter_gva_dbs_reader::PagedData;

#[derive(Default)]
pub(crate) struct BlockQuery;
#[async_graphql::Object]
impl BlockQuery {
    /// Get block by number
    async fn block_by_number(
        &self,
        ctx: &async_graphql::Context<'_>,
        #[graphql(desc = "block number")] number: u32,
    ) -> async_graphql::Result<Option<BlockMeta>> {
        let data = ctx.data::<GvaSchemaData>()?;
        let dbs_reader = data.dbs_reader();

        let block = data
            .dbs_pool
            .execute(move |dbs| dbs_reader.block(&dbs.bc_db_ro, U32BE(number)))
            .await??;

        Ok(block.map(|block| BlockMeta::from(&block)))
    }

    /// Get blocks
    async fn blocks(
        &self,
        ctx: &async_graphql::Context<'_>,
        #[graphql(desc = "pagination", default)] pagination: Pagination,
    ) -> async_graphql::Result<Connection<String, BlockMeta, EmptyFields, EmptyFields>> {
        let QueryContext { is_whitelisted } = ctx.data::<QueryContext>()?;
        let page_info = Pagination::convert_to_page_info(pagination, *is_whitelisted)?;

        let data = ctx.data::<GvaSchemaData>()?;
        let dbs_reader = data.dbs_reader();

        let PagedData {
            data: blocks,
            has_next_page,
            has_previous_page,
        } = data
            .dbs_pool
            .execute(move |dbs| dbs_reader.blocks(&dbs.bc_db_ro, page_info))
            .await??;

        let mut conn = Connection::new(has_previous_page, has_next_page);

        conn.append(blocks.into_iter().map(|(block_cursor, block)| {
            Edge::new(block_cursor.to_string(), BlockMeta::from(block))
        }));

        Ok(conn)
    }
}

#[cfg(test)]
mod tests {
    use super::BlockNumber;
    use crate::tests::*;
    use duniter_dbs::BlockMetaV2;
    use duniter_gva_dbs_reader::{block::BlockCursor, PagedData};

    #[tokio::test]
    async fn test_block_by_number() -> anyhow::Result<()> {
        let mut dbs_reader = MockDbsReader::new();
        dbs_reader
            .expect_block()
            .withf(|_, s| s.0 == 0)
            .times(1)
            .returning(|_, _| Ok(Some(BlockMetaV2::default())));
        let schema = create_schema(dbs_reader)?;
        assert_eq!(
            exec_graphql_request(&schema, r#"{ blockByNumber(number: 0) {number} }"#).await?,
            serde_json::json!({
                "data": {
                    "blockByNumber": {
                        "number": BlockMetaV2::default().number,
                    }
                }
            })
        );
        Ok(())
    }

    #[tokio::test]
    async fn test_blocks() -> anyhow::Result<()> {
        let mut dbs_reader = MockDbsReader::new();
        dbs_reader.expect_blocks().times(1).returning(|_, _| {
            Ok(PagedData {
                data: vec![(
                    BlockCursor {
                        number: BlockNumber(0),
                    },
                    BlockMetaV2::default(),
                )],
                has_next_page: false,
                has_previous_page: false,
            })
        });
        let schema = create_schema(dbs_reader)?;
        assert_eq!(
            exec_graphql_request(
                &schema,
                r#"{ blocks{pageInfo{startCursor,endCursor},edges{node{number}}} }"#
            )
            .await?,
            serde_json::json!({
                "data": {
                    "blocks": {
                        "edges": [
                            {
                                "node": {
                                    "number": BlockMetaV2::default().number,
                                }
                            }
                        ],
                        "pageInfo": {
                            "endCursor": BlockMetaV2::default().number.to_string(),
                            "startCursor": BlockMetaV2::default().number.to_string(),
                        }
                    }
                }
            })
        );
        Ok(())
    }
}

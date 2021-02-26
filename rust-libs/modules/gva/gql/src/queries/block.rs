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
}

#[cfg(test)]
mod tests {
    use crate::tests::*;

    #[tokio::test]
    async fn test_block() -> anyhow::Result<()> {
        let mut dbs_reader = MockDbsReader::new();
        dbs_reader
            .expect_block()
            .withf(|_, s| s.0 == 0)
            .times(1)
            .returning(|_, _| Ok(Some(duniter_dbs::BlockMetaV2::default())));
        let schema = create_schema(dbs_reader)?;
        assert_eq!(
            exec_graphql_request(&schema, r#"{ blockByNumber(number: 0) {number} }"#).await?,
            serde_json::json!({
                "data": {
                    "blockByNumber": {
                        "number": duniter_dbs::BlockMetaV2::default().number,
                    }
                }
            })
        );
        Ok(())
    }
}

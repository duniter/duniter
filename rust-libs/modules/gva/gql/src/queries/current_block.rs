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

#[derive(Default)]
pub(crate) struct CurrentBlockQuery;
#[async_graphql::Object]
impl CurrentBlockQuery {
    /// Get current block
    async fn current_block(
        &self,
        ctx: &async_graphql::Context<'_>,
    ) -> async_graphql::Result<Block> {
        let data = ctx.data::<GvaSchemaData>()?;
        let dbs_reader = data.dbs_reader();

        data.dbs_pool
            .execute(move |dbs| {
                if let Some(current_block) = dbs_reader.get_current_block(&dbs.cm_db)? {
                    Ok(Block::from(&current_block))
                } else {
                    Err(async_graphql::Error::new("no blockchain"))
                }
            })
            .await?
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::*;
    use dubp::block::DubpBlockV10;
    use duniter_dbs::databases::cm_v1::CmV1Db;

    #[tokio::test]
    async fn query_current_block() -> anyhow::Result<()> {
        let mut dbs_reader = MockDbsReader::new();
        dbs_reader
            .expect_get_current_block::<CmV1Db<MemSingleton>>()
            .times(1)
            .returning(|_| Ok(Some(DubpBlockV10::default())));
        let schema = create_schema(dbs_reader)?;
        assert_eq!(
            exec_graphql_request(&schema, r#"{ currentBlock {nonce} }"#).await?,
            serde_json::json!({
                "data": {
                    "currentBlock": {
                      "nonce": 0
                    }
                }
            })
        );
        Ok(())
    }
}

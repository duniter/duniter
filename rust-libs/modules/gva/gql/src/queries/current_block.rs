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
    ) -> async_graphql::Result<BlockMeta> {
        let data = ctx.data::<GvaSchemaData>()?;

        if let Some(current_block_meta) = data
            .cm_accessor()
            .get_current_meta(|cm| cm.current_block_meta)
            .await
        {
            Ok(current_block_meta.into())
        } else {
            Err(async_graphql::Error::new("no blockchain"))
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::tests::*;

    #[tokio::test]
    async fn query_current_block() -> anyhow::Result<()> {
        let mut mock_cm = MockAsyncAccessor::new();
        mock_cm
            .expect_get_current_meta::<duniter_dbs::BlockMetaV2>()
            .times(1)
            .returning(|f| Some(f(&CurrentMeta::default())));
        let schema = create_schema(mock_cm, MockDbsReader::new())?;
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

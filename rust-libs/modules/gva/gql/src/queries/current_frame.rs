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
pub(crate) struct CurrentFrameQuery;
#[async_graphql::Object]
impl CurrentFrameQuery {
    /// Get blocks in current frame
    async fn current_frame(
        &self,
        ctx: &async_graphql::Context<'_>,
    ) -> async_graphql::Result<Vec<BlockMeta>> {
        let data = ctx.data::<GvaSchemaData>()?;
        let dbs_reader = data.dbs_reader();

        if let Some(current_block_meta) = data
            .cm_accessor()
            .get_current_meta(|cm| cm.current_block_meta)
            .await
        {
            Ok(data
                .dbs_pool
                .execute(move |dbs| {
                    dbs_reader.get_current_frame(&dbs.bc_db_ro, &current_block_meta)
                })
                .await??
                .into_iter()
                .map(Into::into)
                .collect())
        } else {
            Ok(vec![])
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::*;
    use duniter_dbs::databases::bc_v2::BcV2DbRo;
    use duniter_dbs::BlockMetaV2;

    #[tokio::test]
    async fn query_current_frame() -> anyhow::Result<()> {
        let mut mock_cm = MockAsyncAccessor::new();
        mock_cm
            .expect_get_current_meta::<BlockMetaV2>()
            .times(1)
            .returning(|f| {
                Some(f(&CurrentMeta {
                    current_block_meta: BlockMetaV2 {
                        issuers_frame: 1,
                        ..Default::default()
                    },
                    ..Default::default()
                }))
            });
        let mut dbs_reader = MockDbsReader::new();
        dbs_reader
            .expect_get_current_frame::<BcV2DbRo<FileBackend>>()
            .times(1)
            .returning(|_, _| {
                Ok(vec![BlockMetaV2 {
                    ..Default::default()
                }])
            });
        let schema = create_schema(mock_cm, dbs_reader)?;
        assert_eq!(
            exec_graphql_request(&schema, r#"{ currentFrame {nonce} }"#).await?,
            serde_json::json!({
                "data": {
                    "currentFrame": [{
                      "nonce": 0
                    }]
                }
            })
        );
        Ok(())
    }
}

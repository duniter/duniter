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
    ) -> async_graphql::Result<Vec<Block>> {
        let data = ctx.data::<GvaSchemaData>()?;
        let dbs_reader = data.dbs_reader();

        Ok(data
            .dbs_pool
            .execute(move |dbs| dbs_reader.get_current_frame(&dbs.bc_db_ro))
            .await??
            .into_iter()
            .map(Into::into)
            .collect())
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
        let mut dbs_reader = MockDbsReader::new();
        dbs_reader
            .expect_get_current_frame::<BcV2DbRo<FileBackend>>()
            .times(1)
            .returning(|_| {
                Ok(vec![BlockMetaV2 {
                    ..Default::default()
                }])
            });
        let schema = create_schema(dbs_reader)?;
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

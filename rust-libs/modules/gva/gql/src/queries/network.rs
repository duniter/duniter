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

#[derive(Default, async_graphql::SimpleObject)]
pub(crate) struct NetworkQuery {
    network: NetworkQueryInner,
}

#[derive(Default)]
pub(crate) struct NetworkQueryInner;

#[async_graphql::Object]
impl NetworkQueryInner {
    /// Get endpoints known by the node
    async fn endpoints(
        &self,
        ctx: &async_graphql::Context<'_>,
        #[graphql(
            desc = "filter endpoints by api (exact match endpoint first word, case sensitive)"
        )]
        api_list: Vec<String>,
    ) -> async_graphql::Result<Vec<String>> {
        let data = ctx.data::<GvaSchemaData>()?;
        let dbs_reader = data.dbs_reader();

        Ok(data
            .dbs_pool
            .execute(move |dbs| dbs_reader.endpoints(&dbs.dunp_db, api_list))
            .await??)
    }
    /// Get peers and heads
    async fn nodes(
        &self,
        ctx: &async_graphql::Context<'_>,
    ) -> async_graphql::Result<Vec<PeerWithHeads>> {
        let data = ctx.data::<GvaSchemaData>()?;

        let db_reader = data.dbs_reader();

        Ok(data
            .dbs_pool
            .execute(move |dbs| db_reader.peers_and_heads(&dbs.dunp_db))
            .await??
            .into_iter()
            .map(|(peer, heads)| PeerWithHeads {
                peer: PeerCardGva::from(peer),
                heads: heads.into_iter().map(HeadGva::from).collect(),
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::*;
    use duniter_dbs::databases::dunp_v1::DunpV1Db;
    use pretty_assertions::assert_eq;

    #[tokio::test]
    async fn test_endpoints() -> anyhow::Result<()> {
        let mock_cm = MockAsyncAccessor::new();
        let mut mock_dbs_reader = MockDbsReader::new();
        mock_dbs_reader
            .expect_endpoints::<DunpV1Db<FileBackend>>()
            .times(1)
            .returning(|_, _| {
                Ok(vec![
                    "GVA S g1.librelois.fr 443 gva".to_owned(),
                    "GVA S domain.tld 443 gva".to_owned(),
                ])
            });
        let schema = create_schema(mock_cm, mock_dbs_reader)?;
        assert_eq!(
            exec_graphql_request(&schema, r#"{ network { endpoints(apiList:["GVA"]) } }"#).await?,
            serde_json::json!({
                "data": {
                    "network": {
                        "endpoints": [
                            "GVA S g1.librelois.fr 443 gva",
                            "GVA S domain.tld 443 gva"
                        ]
                    }
                }
            })
        );
        Ok(())
    }

    #[tokio::test]
    async fn test_peers_and_heads() -> anyhow::Result<()> {
        let mut dbs_reader = MockDbsReader::new();
        dbs_reader
            .expect_peers_and_heads::<DunpV1Db<FileBackend>>()
            .times(1)
            .returning(|_| {
                Ok(vec![(
                    duniter_dbs::PeerCardDbV1::default(),
                    vec![duniter_dbs::DunpHeadDbV1::default()],
                )])
            });
        let schema = create_schema(MockAsyncAccessor::new(), dbs_reader)?;
        assert_eq!(
            exec_graphql_request(
                &schema,
                r#"{ network { nodes { peer { blockstamp }, heads { blockstamp } } } }"#
            )
            .await?,
            serde_json::json!({
                "data": {
                    "network": {
                        "nodes": [
                            {
                                "heads": [
                                    {
                                        "blockstamp": "0-0000000000000000000000000000000000000000000000000000000000000000"
                                    }
                                ],
                                "peer": {
                                    "blockstamp": ""
                                }
                            }
                        ],
                    }
                }
            })
        );
        Ok(())
    }
}

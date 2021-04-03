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

// e2e requester pour obtenir la fiche de peer et un tableau de heads pour une pubKey donnée

// e2e requester pour obtenir la list des endpoints connu filtrable par type (gva, bma, ws2p, es?data-pod)
// ? e2e list endpoints type
// ? renomer dunp_v1 en network_v1 & DunpV1Db & co

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::*;
    use duniter_dbs::databases::dunp_v1::DunpV1Db;

    #[tokio::test]
    async fn endpoints_gva_resolver() -> anyhow::Result<()> {
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
            exec_graphql_request(&schema, r#"{ endpoints(apiList:["GVA"]) }"#).await?,
            serde_json::json!({
                "data": {
                    "endpoints": [
                        "GVA S g1.librelois.fr 443 gva",
                        "GVA S domain.tld 443 gva"
                        ]
                }
            })
        );
        Ok(())
    }
}

#[derive(Default)]
pub(crate) struct EndpointsQuery;
#[async_graphql::Object]
impl EndpointsQuery {
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
}

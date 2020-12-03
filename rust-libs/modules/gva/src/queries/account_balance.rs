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
pub(crate) struct AccountBalanceQuery;
#[async_graphql::Object]
impl AccountBalanceQuery {
    /// Account balance
    async fn balance(
        &self,
        ctx: &async_graphql::Context<'_>,
        #[graphql(desc = "Account script or public key")] script: String,
    ) -> async_graphql::Result<AmountWithBase> {
        let account_script = if let Ok(pubkey) = PublicKey::from_base58(&script) {
            WalletScriptV10::single_sig(pubkey)
        } else {
            dubp::documents_parser::wallet_script_from_str(&script)?
        };

        let data = ctx.data::<SchemaData>()?;
        let dbs_reader = data.dbs_reader();

        let balance = data
            .dbs_pool
            .execute(move |dbs| dbs_reader.get_account_balance(&dbs.gva_db, &account_script))
            .await??
            .unwrap_or_default()
            .0;

        Ok(AmountWithBase {
            amount: balance.amount() as i32,
            base: balance.base() as i32,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::*;
    use duniter_dbs::SourceAmountValV2;

    #[tokio::test]
    async fn query_balance() -> anyhow::Result<()> {
        let mut dbs_reader = MockDbsReader::new();
        use duniter_dbs::gva_v1::GvaV1Db;
        dbs_reader
            .expect_get_account_balance::<GvaV1Db<FileBackend>>()
            .withf(|_, s| {
                s == &WalletScriptV10::single_sig(
                    PublicKey::from_base58("DnjL6hYA1k7FavGHbbir79PKQbmzw63d6bsamBBdUULP")
                        .expect("wrong pubkey"),
                )
            })
            .times(1)
            .returning(|_, _| Ok(Some(SourceAmountValV2(SourceAmount::with_base0(38)))));
        let schema = create_schema(dbs_reader)?;
        assert_eq!(
            exec_graphql_request(
                &schema,
                r#"{ balance(script: "DnjL6hYA1k7FavGHbbir79PKQbmzw63d6bsamBBdUULP") {amount} }"#
            )
            .await?,
            serde_json::json!({
                "data": {
                    "balance": {
                      "amount": 38
                    }
                }
            })
        );
        Ok(())
    }
}

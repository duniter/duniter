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
    /// Get the balance of an account identified by a public key or a script.
    ///
    /// If the balance is null, the account has never been used. If the balance is zero, the account has already transited money in the past.
    async fn balance(
        &self,
        ctx: &async_graphql::Context<'_>,
        #[graphql(desc = "Account script or public key")] script: PkOrScriptGva,
    ) -> async_graphql::Result<Option<AmountWithBase>> {
        let data = ctx.data::<GvaSchemaData>()?;
        let dbs_reader = data.dbs_reader();

        Ok(data
            .dbs_pool
            .execute(move |_| dbs_reader.get_account_balance(&script.0))
            .await??
            .map(|balance| AmountWithBase {
                amount: balance.0.amount() as i32,
                base: balance.0.base() as i32,
            }))
    }
    /// Get the balance of several accounts in a single request
    ///
    /// Each account can be identified by a public key or a script. It is possible to mix the two in the same request.
    /// The balances are returned in the order of the accounts provided as input. Each account has a balance,
    /// which is null if the account does not exist.
    async fn balances(
        &self,
        ctx: &async_graphql::Context<'_>,
        #[graphql(desc = "Accounts scripts or publics keys")] scripts: Vec<PkOrScriptGva>,
    ) -> async_graphql::Result<Vec<Option<AmountWithBase>>> {
        let data = ctx.data::<GvaSchemaData>()?;
        let dbs_reader = data.dbs_reader();

        Ok(data
            .dbs_pool
            .execute(move |_| {
                scripts
                    .iter()
                    .map(|account_script| {
                        dbs_reader
                            .get_account_balance(&account_script.0)
                            .map(|balance_opt| {
                                balance_opt.map(|balance| AmountWithBase {
                                    amount: balance.0.amount() as i32,
                                    base: balance.0.base() as i32,
                                })
                            })
                    })
                    .collect::<Result<Vec<_>, _>>()
            })
            .await??)
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
        dbs_reader
            .expect_get_account_balance()
            .withf(|s| {
                s == &WalletScriptV10::single_sig(
                    PublicKey::from_base58("DnjL6hYA1k7FavGHbbir79PKQbmzw63d6bsamBBdUULP")
                        .expect("wrong pubkey"),
                )
            })
            .times(1)
            .returning(|_| Ok(Some(SourceAmountValV2(SourceAmount::with_base0(38)))));
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

    #[tokio::test]
    async fn query_balances() -> anyhow::Result<()> {
        let mut dbs_reader = MockDbsReader::new();
        dbs_reader
            .expect_get_account_balance()
            .withf(|s| {
                s == &WalletScriptV10::single_sig(
                    PublicKey::from_base58("DnjL6hYA1k7FavGHbbir79PKQbmzw63d6bsamBBdUULP")
                        .expect("wrong pubkey"),
                )
            })
            .times(1)
            .returning(|_| Ok(Some(SourceAmountValV2(SourceAmount::with_base0(38)))));
        let schema = create_schema(dbs_reader)?;
        assert_eq!(
            exec_graphql_request(
                &schema,
                r#"{ balances(scripts: ["DnjL6hYA1k7FavGHbbir79PKQbmzw63d6bsamBBdUULP"]) {amount} }"#
            )
            .await?,
            serde_json::json!({
                "data": {
                    "balances": [{
                      "amount": 38
                    }]
                }
            })
        );
        Ok(())
    }
}

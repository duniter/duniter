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

const MAX_INPUTS_PER_SIMPLE_TX: usize = 46;

#[derive(Default)]
pub(crate) struct GenTxsQuery;
#[async_graphql::Object]
impl GenTxsQuery {
    /// Generate transaction documents
    async fn gen_txs(
        &self,
        ctx: &async_graphql::Context<'_>,
        #[graphql(desc = "Transaction amount")] amount: i32,
        #[graphql(desc = "Transaction comment")] comment: Option<String>,
        #[graphql(desc = "Ed25519 public key on base 58 representation")] issuer: String,
        #[graphql(desc = "Ed25519 public key on base 58 representation")] recipient: String,
        #[graphql(desc = "Use mempool sources", default = false)] use_mempool_sources: bool,
    ) -> async_graphql::Result<Vec<String>> {
        let amount = SourceAmount::with_base0(amount as i64);
        let comment = comment.unwrap_or_default();
        if !TransactionDocumentV10::verify_comment(&comment) {
            return Err(async_graphql::Error::new("invalid comment"));
        }
        let issuer = PublicKey::from_base58(&issuer)?;
        let recipient = PublicKey::from_base58(&recipient)?;

        let data = ctx.data::<SchemaData>()?;
        let currency = data.server_meta_data.currency.clone();

        let (current_block, inputs, inputs_sum) = data
            .dbs_pool
            .execute(move |dbs| {
                duniter_dbs_read_ops::find_inputs::find_inputs(
                    &dbs.bc_db,
                    &dbs.gva_db,
                    &dbs.txs_mp_db,
                    amount,
                    &WalletScriptV10::single(WalletConditionV10::Sig(issuer)),
                    use_mempool_sources,
                )
            })
            .await??;

        if inputs_sum < amount {
            return Err(async_graphql::Error::new("insufficient balance"));
        }

        let current_blockstamp = Blockstamp {
            number: BlockNumber(current_block.number),
            hash: BlockHash(current_block.hash),
        };

        Ok(TransactionDocumentV10::generate_simple_txs(
            current_blockstamp,
            currency,
            (inputs, inputs_sum),
            MAX_INPUTS_PER_SIMPLE_TX,
            issuer,
            recipient,
            (amount, comment),
        ))
    }
}

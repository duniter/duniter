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
use dubp::{
    crypto::bases::BaseConversionError,
    documents::transaction::v10_gen::{TransactionDocV10ComplexGen, TxV10ComplexIssuer},
};
use duniter_dbs::smallvec::SmallVec;

struct TxIssuerTyped {
    script: WalletScriptV10,
    signers: SmallVec<[PublicKey; 1]>,
    codes: SmallVec<[String; 1]>,
    amount: i32,
}
impl TryFrom<TxIssuer> for TxIssuerTyped {
    type Error = async_graphql::Error;

    fn try_from(input: TxIssuer) -> async_graphql::Result<Self> {
        let codes = if let Some(codes) = input.codes {
            codes.into_iter().collect()
        } else {
            SmallVec::new()
        };
        let signers: SmallVec<[PublicKey; 1]> = input
            .signers
            .iter()
            .map(|s| PublicKey::from_base58(s))
            .collect::<Result<_, BaseConversionError>>()?;
        let script = if let Some(ref script_str) = input.script {
            dubp::documents_parser::wallet_script_from_str(script_str)?
        } else if signers.len() <= 3 && codes.is_empty() {
            match signers.len() {
                1 => WalletScriptV10::single(WalletConditionV10::Sig(signers[0])),
                2 => WalletScriptV10::and(
                    WalletConditionV10::Sig(signers[0]),
                    WalletConditionV10::Sig(signers[1]),
                ),
                3 => WalletScriptV10::and_and(
                    WalletConditionV10::Sig(signers[0]),
                    WalletConditionV10::Sig(signers[1]),
                    WalletConditionV10::Sig(signers[2]),
                ),
                _ => unreachable!(),
            }
        } else {
            return Err(async_graphql::Error::new("missing a issuer script"));
        };
        Ok(Self {
            script,
            signers,
            codes,
            amount: input.amount,
        })
    }
}
struct TxRecipientTyped {
    amount: i32,
    script: WalletScriptV10,
}
impl TryFrom<TxRecipient> for TxRecipientTyped {
    type Error = async_graphql::Error;

    fn try_from(input: TxRecipient) -> async_graphql::Result<Self> {
        let script = dubp::documents_parser::wallet_script_from_str(&input.script)?;
        Ok(Self {
            amount: input.amount,
            script,
        })
    }
}

#[derive(Default)]
pub(crate) struct GenTxsQuery;
#[async_graphql::Object]
impl GenTxsQuery {
    /// Generate simple transaction document
    async fn gen_tx(
        &self,
        ctx: &async_graphql::Context<'_>,
        #[graphql(desc = "Transaction amount", validator(IntGreaterThan(value = "0")))] amount: i32,
        #[graphql(desc = "Transaction comment", validator(TxCommentValidator))] comment: Option<
            String,
        >,
        #[graphql(
            desc = "Ed25519 public key on base 58 representation",
            validator(and(StringMinLength(length = "40"), StringMaxLength(length = "44")))
        )]
        issuer: String,
        #[graphql(
            desc = "Ed25519 public key on base 58 representation",
            validator(and(StringMinLength(length = "40"), StringMaxLength(length = "44")))
        )]
        recipient: String,
        #[graphql(desc = "Use mempool sources", default = false)] use_mempool_sources: bool,
    ) -> async_graphql::Result<Vec<String>> {
        let comment = comment.unwrap_or_default();
        let issuer = PublicKey::from_base58(&issuer)?;
        let recipient = PublicKey::from_base58(&recipient)?;

        let data = ctx.data::<SchemaData>()?;
        let currency = data.server_meta_data.currency.clone();

        let (current_block, (inputs, inputs_sum)) = data
            .dbs_pool
            .execute(move |dbs| {
                if let Some(current_block) =
                    duniter_dbs_read_ops::get_current_block_meta(&dbs.bc_db)?
                {
                    Ok((
                        current_block,
                        duniter_dbs_read_ops::find_inputs::find_inputs(
                            &dbs.bc_db,
                            &dbs.gva_db,
                            &dbs.txs_mp_db,
                            SourceAmount::new(amount as i64, current_block.unit_base as i64),
                            &WalletScriptV10::single(WalletConditionV10::Sig(issuer)),
                            use_mempool_sources,
                        )?,
                    ))
                } else {
                    Err(KvError::Custom("no blockchain".into()))
                }
            })
            .await??;

        let amount = SourceAmount::new(amount as i64, current_block.unit_base as i64);

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
            issuer,
            recipient,
            (amount, comment),
        ))
    }
    /// Generate complex transaction document
    async fn gen_complex_tx(
        &self,
        ctx: &async_graphql::Context<'_>,
        #[graphql(desc = "Transaction issuers")] issuers: Vec<TxIssuer>,
        #[graphql(desc = "Transaction issuers")] recipients: Vec<TxRecipient>,
        #[graphql(desc = "Transaction comment", validator(TxCommentValidator))] comment: Option<
            String,
        >,
        #[graphql(desc = "Use mempool sources", default = false)] use_mempool_sources: bool,
    ) -> async_graphql::Result<RawTxOrChanges> {
        let comment = comment.unwrap_or_default();
        let issuers = issuers
            .into_iter()
            .map(TryFrom::try_from)
            .collect::<async_graphql::Result<Vec<TxIssuerTyped>>>()?;
        let recipients = recipients
            .into_iter()
            .map(TryFrom::try_from)
            .collect::<async_graphql::Result<Vec<TxRecipientTyped>>>()?;

        let issuers_sum: i32 = issuers.iter().map(|issuer| issuer.amount).sum();
        let recipients_sum: i32 = recipients.iter().map(|recipient| recipient.amount).sum();
        if issuers_sum != recipients_sum {
            return Err(async_graphql::Error::new(
            "The sum of the amounts of the issuers must be equal to the sum of the amounts of the recipients.",
        ));
        }

        let data = ctx.data::<SchemaData>()?;
        let currency = data.server_meta_data.currency.clone();

        let (current_block, issuers_inputs_with_sum) = data
            .dbs_pool
            .execute(move |dbs| {
                if let Some(current_block) =
                    duniter_dbs_read_ops::get_current_block_meta(&dbs.bc_db)?
                {
                    let mut issuers_inputs_with_sum = Vec::new();
                    for issuer in issuers {
                        issuers_inputs_with_sum.push((
                            duniter_dbs_read_ops::find_inputs::find_inputs(
                                &dbs.bc_db,
                                &dbs.gva_db,
                                &dbs.txs_mp_db,
                                SourceAmount::new(
                                    issuer.amount as i64,
                                    current_block.unit_base as i64,
                                ),
                                &issuer.script,
                                use_mempool_sources,
                            )?,
                            issuer,
                        ));
                    }
                    Ok((current_block, issuers_inputs_with_sum))
                } else {
                    Err(KvError::Custom("no blockchain".into()))
                }
            })
            .await??;

        for ((_inputs, inputs_sum), issuer) in &issuers_inputs_with_sum {
            let amount = SourceAmount::new(issuer.amount as i64, current_block.unit_base as i64);
            if *inputs_sum < amount {
                return Err(async_graphql::Error::new(format!(
                    "Insufficient balance for issuer {}",
                    issuer.script.to_string()
                )));
            }
        }

        let current_blockstamp = Blockstamp {
            number: BlockNumber(current_block.number),
            hash: BlockHash(current_block.hash),
        };
        let base = current_block.unit_base as i64;

        let (final_tx_opt, changes_txs) = TransactionDocV10ComplexGen {
            blockstamp: current_blockstamp,
            currency,
            issuers: issuers_inputs_with_sum
                .into_iter()
                .map(|((inputs, inputs_sum), issuer)| TxV10ComplexIssuer {
                    amount: SourceAmount::new(issuer.amount as i64, base),
                    codes: issuer.codes,
                    inputs,
                    inputs_sum,
                    script: issuer.script,
                    signers: issuer.signers,
                })
                .collect(),
            recipients: recipients
                .into_iter()
                .map(|TxRecipientTyped { amount, script }| {
                    (SourceAmount::new(amount as i64, base), script)
                })
                .collect(),
            user_comment: comment,
        }
        .gen()?;

        if let Some(final_tx) = final_tx_opt {
            Ok(RawTxOrChanges::FinalTx(final_tx))
        } else {
            Ok(RawTxOrChanges::Changes(changes_txs))
        }
    }
}

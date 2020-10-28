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

const MAX_UDS_INPUTS: usize = 20;
const MAX_UTXOS_INPUTS: usize = 20;

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
    ) -> async_graphql::Result<Vec<String>> {
        let amount = SourceAmount::with_base0(amount as i64);
        let comment = comment.unwrap_or_default();
        if !TransactionDocumentV10::verify_comment(&comment) {
            return Err(async_graphql::Error::new("invalid comment"));
        }
        let issuer = PublicKey::from_base58(&issuer)?;
        let recipient = PublicKey::from_base58(&recipient)?;

        let data = ctx.data::<SchemaData>()?;
        let currency = data.currency.clone();

        let (current_block, inputs, inputs_sum) = data
            .dbs_pool
            .execute(move |dbs| {
                if let Some(current_block) =
                    duniter_dbs_read_ops::get_current_block_meta(&dbs.bc_db)?
                {
                    let (uds, uds_sum) = duniter_dbs_read_ops::uds_of_pubkey::uds_of_pubkey(
                        &dbs.bc_db,
                        issuer,
                        ..,
                        Some(MAX_UDS_INPUTS),
                        Some(amount),
                    )?;
                    let mut inputs = uds
                        .into_iter()
                        .map(
                            |(block_number, source_amount)| TransactionInputV10 {
                                amount: source_amount,
                                id: SourceIdV10::Ud(UdSourceIdV10 {
                                    issuer,
                                    block_number,
                                }),
                            },
                        )
                        .collect::<Vec<_>>();
                    if uds_sum < amount {
                        let (utxos, utxos_sum) = duniter_dbs_read_ops::utxos::get_script_utxos(
                            &dbs.gva_db,
                            &WalletScriptV10::single(WalletConditionV10::Sig(issuer)),
                            Some(MAX_UTXOS_INPUTS),
                            Some(amount - uds_sum),
                        )?;
                        inputs.extend(utxos.into_iter()
                        .map(
                            |(_written_time, utxo_id, source_amount)| TransactionInputV10 {
                                amount: source_amount,
                                id: SourceIdV10::Utxo(utxo_id),
                            },
                        ));
                        let inputs_sum = uds_sum + utxos_sum;
                        if inputs_sum < amount {
                            Err(KvError::Custom("Amount need too many sources or issuer's account has an insufficient balance.".into()))
                        } else {
                            Ok::<_, KvError>((
                                current_block,
                                inputs,
                                inputs_sum
                            ))
                        }
                    } else {
                        Ok::<_, KvError>((
                            current_block,
                            inputs,
                            uds_sum
                        ))
                    }
                } else {
                    Err(KvError::Custom("no blockchain".into()))
                }
            })
            .await??;

        let current_blockstamp = Blockstamp {
            number: BlockNumber(current_block.number),
            hash: BlockHash(current_block.hash),
        };

        Ok(vec![gen_tx_with_inputs(
            amount,
            current_blockstamp,
            comment,
            currency,
            (inputs, inputs_sum),
            issuer,
            recipient,
        )])
    }
}

fn gen_tx_with_inputs(
    amount: SourceAmount,
    blockstamp: Blockstamp,
    comment: String,
    currency: String,
    inputs_with_sum: (Vec<TransactionInputV10>, SourceAmount),
    issuer: PublicKey,
    recipient: PublicKey,
) -> String {
    let (inputs, inputs_sum) = inputs_with_sum;
    let inputs_len = inputs.len();
    let unlocks = (0..inputs_len)
        .into_iter()
        .map(TransactionInputUnlocksV10::single_index)
        .collect::<Vec<_>>();

    let rest = inputs_sum - amount;
    let main_output = TransactionOutputV10 {
        amount,
        conditions: UTXOConditions::from(WalletScriptV10::single(WalletConditionV10::Sig(
            recipient,
        ))),
    };
    let outputs = if rest.amount() > 0 {
        svec![
            main_output,
            TransactionOutputV10 {
                amount: rest,
                conditions: UTXOConditions::from(WalletScriptV10::single(WalletConditionV10::Sig(
                    issuer,
                ))),
            },
        ]
    } else {
        svec![main_output]
    };

    TransactionDocumentV10Builder {
        currency: &currency,
        blockstamp,
        locktime: 0,
        issuers: svec![issuer],
        inputs: &inputs,
        unlocks: &unlocks,
        outputs,
        comment: &comment,
        hash: None,
    }
    .generate_text()
}

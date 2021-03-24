//  Copyright (C) 2020 Éloïs SANCHEZ.
//
// This program is free software current_block_number: (), current_block_hash: (), inputs: (), inputs_sum: (): you can redistribute it and/or modify
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
use dubp::wallet::prelude::*;
use duniter_bca_types::prepare_payment::{PrepareSimplePayment, PrepareSimplePaymentResp};

pub(super) async fn exec_req_prepare_simple_payment(
    bca_executor: &BcaExecutor,
    params: PrepareSimplePayment,
) -> Result<BcaRespTypeV0, ExecReqTypeError> {
    let issuer = params.issuer;

    if let Some(current_meta) = bca_executor.cm_accessor.get_current_meta(|cm| *cm).await {
        let current_block_meta = current_meta.current_block_meta;
        let current_ud = current_meta.current_ud;
        let dbs_reader = bca_executor.dbs_reader();
        let (amount, block_ref_number, block_ref_hash, (inputs, inputs_sum)) = bca_executor
            .dbs_pool
            .execute(move |dbs| {
                let mut amount = params.amount.to_cents(current_ud);
                let block_ref_number = if current_block_meta.number < 101 {
                    0
                } else {
                    current_block_meta.number - 101
                };
                let block_ref_hash = dbs_reader
                    .block(&dbs.bc_db_ro, U32BE(block_ref_number))?
                    .expect("unreachable")
                    .hash;
                let current_base = current_block_meta.unit_base as i64;

                if amount.base() > current_base {
                    Err("too long base".into())
                } else {
                    while amount.base() < current_base {
                        amount = amount.increment_base();
                    }
                    Ok::<_, ExecReqTypeError>((
                        amount,
                        block_ref_number,
                        block_ref_hash,
                        dbs_reader.find_inputs(
                            &dbs.bc_db_ro,
                            &dbs.txs_mp_db,
                            amount,
                            &WalletScriptV10::single(WalletConditionV10::Sig(issuer)),
                            false,
                        )?,
                    ))
                }
            })
            .await??;

        if inputs_sum < amount {
            return Err("insufficient balance".into());
        }

        Ok(BcaRespTypeV0::PrepareSimplePayment(
            PrepareSimplePaymentResp {
                current_block_number: block_ref_number,
                current_block_hash: block_ref_hash,
                current_ud,
                inputs,
                inputs_sum,
            },
        ))
    } else {
        Err("no blockchain".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::*;

    #[tokio::test]
    async fn test_exec_req_prepare_simple_payment_no_blockchain() {
        let mut mock_cm = MockAsyncAccessor::new();
        mock_cm
            .expect_get_current_meta::<CurrentMeta>()
            .times(1)
            .returning(|_| None);
        let dbs_reader = MockDbsReader::new();
        let bca_executor =
            create_bca_executor(mock_cm, dbs_reader).expect("fail to create bca executor");

        let resp_res = exec_req_prepare_simple_payment(
            &bca_executor,
            PrepareSimplePayment {
                issuer: PublicKey::default(),
                amount: Amount::Cents(SourceAmount::new(42, 0)),
            },
        )
        .await;

        assert_eq!(resp_res, Err(ExecReqTypeError("no blockchain".into())));
    }

    #[tokio::test]
    async fn test_exec_req_prepare_simple_payment_too_long_base() {
        let mut mock_cm = MockAsyncAccessor::new();
        mock_cm
            .expect_get_current_meta::<CurrentMeta>()
            .times(1)
            .returning(|f| Some(f(&CurrentMeta::default())));
        let mut dbs_reader = MockDbsReader::new();
        dbs_reader
            .expect_block()
            .times(1)
            .returning(|_, _| Ok(Some(BlockMetaV2::default())));
        let bca_executor =
            create_bca_executor(mock_cm, dbs_reader).expect("fail to create bca executor");

        let resp_res = exec_req_prepare_simple_payment(
            &bca_executor,
            PrepareSimplePayment {
                issuer: PublicKey::default(),
                amount: Amount::Cents(SourceAmount::new(42, 1)),
            },
        )
        .await;

        assert_eq!(resp_res, Err(ExecReqTypeError("too long base".into())));
    }

    #[tokio::test]
    async fn test_exec_req_prepare_simple_payment_insufficient_balance() {
        let mut mock_cm = MockAsyncAccessor::new();
        mock_cm
            .expect_get_current_meta::<CurrentMeta>()
            .times(1)
            .returning(|f| Some(f(&CurrentMeta::default())));
        let mut dbs_reader = MockDbsReader::new();
        dbs_reader
            .expect_block()
            .times(1)
            .returning(|_, _| Ok(Some(BlockMetaV2::default())));
        dbs_reader
            .expect_find_inputs::<TxsMpV2Db<FileBackend>>()
            .times(1)
            .returning(|_, _, _, _, _| Ok((vec![], SourceAmount::default())));
        let bca_executor =
            create_bca_executor(mock_cm, dbs_reader).expect("fail to create bca executor");

        let resp_res = exec_req_prepare_simple_payment(
            &bca_executor,
            PrepareSimplePayment {
                issuer: PublicKey::default(),
                amount: Amount::Cents(SourceAmount::new(42, 0)),
            },
        )
        .await;

        assert_eq!(
            resp_res,
            Err(ExecReqTypeError("insufficient balance".into()))
        );
    }

    #[tokio::test]
    async fn test_exec_req_prepare_simple_payment_ok() -> Result<(), ExecReqTypeError> {
        let input = TransactionInputV10 {
            amount: SourceAmount::with_base0(57),
            id: SourceIdV10::Utxo(UtxoIdV10 {
                tx_hash: Hash::default(),
                output_index: 3,
            }),
        };

        let mut mock_cm = MockAsyncAccessor::new();
        mock_cm
            .expect_get_current_meta::<CurrentMeta>()
            .times(1)
            .returning(|f| Some(f(&CurrentMeta::default())));
        let mut dbs_reader = MockDbsReader::new();
        dbs_reader
            .expect_block()
            .times(1)
            .returning(|_, _| Ok(Some(BlockMetaV2::default())));
        dbs_reader
            .expect_find_inputs::<TxsMpV2Db<FileBackend>>()
            .times(1)
            .returning(move |_, _, _, _, _| Ok((vec![input], SourceAmount::with_base0(57))));
        let bca_executor =
            create_bca_executor(mock_cm, dbs_reader).expect("fail to create bca executor");

        let resp = exec_req_prepare_simple_payment(
            &bca_executor,
            PrepareSimplePayment {
                issuer: PublicKey::default(),
                amount: Amount::Cents(SourceAmount::new(42, 0)),
            },
        )
        .await?;

        assert_eq!(
            resp,
            BcaRespTypeV0::PrepareSimplePayment(PrepareSimplePaymentResp {
                current_block_number: 0,
                current_block_hash: Hash::default(),
                inputs: vec![input],
                inputs_sum: SourceAmount::with_base0(57),
            })
        );

        Ok(())
    }
}

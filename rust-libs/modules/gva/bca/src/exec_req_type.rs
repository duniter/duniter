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

mod balances;
mod last_blockstamp_out_of_fork_window;
mod members_count;
mod prepare_simple_payment;
mod send_txs;
mod utxos;

use dubp::crypto::keys::KeyPair;

use crate::*;

#[derive(Debug, PartialEq)]
pub(super) struct ExecReqTypeError(pub(super) String);

impl<E> From<E> for ExecReqTypeError
where
    E: ToString,
{
    fn from(e: E) -> Self {
        Self(e.to_string())
    }
}

pub(super) async fn execute_req_type(
    bca_executor: &BcaExecutor,
    req_type: BcaReqTypeV0,
    _is_whitelisted: bool,
) -> Result<BcaRespTypeV0, ExecReqTypeError> {
    match req_type {
        BcaReqTypeV0::BalancesOfPubkeys(pubkeys) => {
            balances::exec_req_balances_of_pubkeys(bca_executor, pubkeys).await
        }
        BcaReqTypeV0::FirstUtxosOfPubkeys {
            amount_target_opt,
            pubkeys,
        } => utxos::exec_req_first_utxos_of_pubkeys(bca_executor, amount_target_opt, pubkeys).await,
        BcaReqTypeV0::LastBlockstampOutOfForkWindow => {
            last_blockstamp_out_of_fork_window::exec_req_last_blockstamp_out_of_fork_window(
                bca_executor,
            )
            .await
        }
        BcaReqTypeV0::MembersCount => members_count::exec_req_members_count(bca_executor).await,
        BcaReqTypeV0::PrepareSimplePayment(params) => {
            prepare_simple_payment::exec_req_prepare_simple_payment(bca_executor, params).await
        }
        BcaReqTypeV0::ProofServerPubkey { challenge } => Ok(BcaRespTypeV0::ProofServerPubkey {
            challenge,
            server_pubkey: bca_executor.self_keypair.public_key(),
            sig: bca_executor
                .self_keypair
                .generate_signator()
                .sign(&challenge),
        }),
        BcaReqTypeV0::Ping => Ok(BcaRespTypeV0::Pong),
        BcaReqTypeV0::SendTxs(txs) => send_txs::send_txs(bca_executor, txs).await,
    }
}

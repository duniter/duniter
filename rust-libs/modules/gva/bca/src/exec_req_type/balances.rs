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
use dubp::{crypto::keys::ed25519::PublicKey, wallet::prelude::WalletScriptV10};

pub(super) async fn exec_req_balances_of_pubkeys(
    bca_executor: &BcaExecutor,
    pubkeys: ArrayVec<[PublicKey; 16]>,
) -> Result<BcaRespTypeV0, ExecReqTypeError> {
    let dbs_reader = bca_executor.dbs_reader();
    Ok(BcaRespTypeV0::Balances(
        bca_executor
            .dbs_pool
            .execute(move |_| {
                pubkeys
                    .into_iter()
                    .map(|pubkey| {
                        dbs_reader
                            .get_account_balance(&WalletScriptV10::single_sig(pubkey))
                            .map(|balance_opt| balance_opt.map(|balance| balance.0))
                    })
                    .collect::<Result<ArrayVec<_>, _>>()
            })
            .await??,
    ))
}

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

pub(super) async fn exec_req_first_utxos_of_pubkeys(
    bca_executor: &BcaExecutor,
    amount_target_opt: Option<Amount>,
    pubkeys: ArrayVec<[PublicKey; 16]>,
) -> Result<BcaRespTypeV0, ExecReqTypeError> {
    if let Some(current_ud) = bca_executor
        .cm_accessor
        .get_current_meta(|cm| cm.current_ud)
        .await
    {
        let dbs_reader = bca_executor.dbs_reader();
        let scripts: ArrayVec<[WalletScriptV10; 16]> = pubkeys
            .into_iter()
            .map(WalletScriptV10::single_sig)
            .collect();
        if let Some(amount_target) = amount_target_opt {
            Ok(BcaRespTypeV0::FirstUtxosOfPubkeys(
                bca_executor
                    .dbs_pool
                    .execute(move |_| {
                        Ok::<_, ExecReqTypeError>(dbs_reader.first_scripts_utxos(
                            Some(amount_target.to_cents(current_ud)),
                            40,
                            &scripts,
                        )?)
                    })
                    .await??,
            ))
        } else {
            Ok(BcaRespTypeV0::FirstUtxosOfPubkeys(
                bca_executor
                    .dbs_pool
                    .execute(move |_| dbs_reader.first_scripts_utxos(None, 40, &scripts))
                    .await??,
            ))
        }
    } else {
        Err("no blockchain".into())
    }
}

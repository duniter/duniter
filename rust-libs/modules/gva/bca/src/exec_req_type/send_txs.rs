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
use dubp::{crypto::keys::KeyPair, documents::transaction::TransactionDocumentTrait};
use duniter_bca_types::{
    rejected_tx::{RejectedTx, RejectedTxReason},
    Txs,
};

pub(super) async fn send_txs(
    bca_executor: &BcaExecutor,
    txs: Txs,
) -> Result<BcaRespTypeV0, ExecReqTypeError> {
    let expected_currency = bca_executor.currency.clone();

    let server_pubkey = bca_executor.self_keypair.public_key();
    let txs_mempool = bca_executor.txs_mempool;

    let mut rejected_txs = Vec::new();
    for (i, tx) in txs.into_iter().enumerate() {
        if let Err(e) = tx.verify(Some(&expected_currency)) {
            rejected_txs.push(RejectedTx {
                tx_index: i as u16,
                reason: RejectedTxReason::InvalidTx(e.to_string()),
            });
        } else if let Err(rejected_tx) = bca_executor
            .dbs_pool
            .execute(move |dbs| {
                txs_mempool
                    .add_pending_tx(&dbs.bc_db_ro, server_pubkey, &dbs.txs_mp_db, &tx)
                    .map_err(|e| RejectedTx {
                        tx_index: i as u16,
                        reason: match e {
                            duniter_mempools::TxMpError::Db(e) => {
                                RejectedTxReason::DbError(e.to_string())
                            }
                            duniter_mempools::TxMpError::Full => RejectedTxReason::MempoolFull,
                            duniter_mempools::TxMpError::TxAlreadyWritten => {
                                RejectedTxReason::TxAlreadyWritten
                            }
                        },
                    })
            })
            .await?
        {
            rejected_txs.push(rejected_tx);
        }
    }
    Ok(BcaRespTypeV0::RejectedTxs(rejected_txs))
}

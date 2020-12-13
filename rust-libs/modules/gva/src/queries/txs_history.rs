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
use dubp::documents_parser::wallet_script_from_str;
use futures::future::join;

#[derive(Default)]
pub(crate) struct TxsHistoryBlockchainQuery;

#[async_graphql::Object]
impl TxsHistoryBlockchainQuery {
    /// Transactions history (written in blockchain)
    async fn txs_history_bc(
        &self,
        ctx: &async_graphql::Context<'_>,
        #[graphql(desc = "Ed25519 public key on base 58 representation or DUBP script")]
        pubkey_or_script: String,
    ) -> async_graphql::Result<TxsHistoryBlockchain> {
        let start_time = std::time::Instant::now();
        let script = if let Ok(pubkey) = PublicKey::from_base58(&pubkey_or_script) {
            WalletScriptV10::single_sig(pubkey)
        } else {
            wallet_script_from_str(&pubkey_or_script)?
        };
        let script_hash = Hash::compute(script.to_string().as_bytes());

        let data = ctx.data::<SchemaData>()?;

        let (sent, received) = if ctx.look_ahead().field("sent").exists() {
            let db_reader = data.dbs_reader();
            let sent_fut = data
                .dbs_pool
                .execute(move |_| db_reader.get_txs_history_bc_sent(script_hash));
            if ctx.look_ahead().field("received").exists() {
                let db_reader = data.dbs_reader();
                let received_fut = data
                    .dbs_pool
                    .execute(move |_| db_reader.get_txs_history_bc_received(script_hash));
                let (sent_res, received_res) = join(sent_fut, received_fut).await;
                (sent_res??, received_res??)
            } else {
                let db_reader = data.dbs_reader();
                (
                    data.dbs_pool
                        .execute(move |_| db_reader.get_txs_history_bc_sent(script_hash))
                        .await??,
                    vec![],
                )
            }
        } else if ctx.look_ahead().field("received").exists() {
            let db_reader = data.dbs_reader();
            (
                vec![],
                data.dbs_pool
                    .execute(move |_| db_reader.get_txs_history_bc_received(script_hash))
                    .await??,
            )
        } else {
            (vec![], vec![])
        };

        println!(
            "txs_history_bc duration: {}ms",
            start_time.elapsed().as_millis()
        );

        Ok(TxsHistoryBlockchain {
            sent: sent.into_iter().map(|db_tx| db_tx.into()).collect(),
            received: received.into_iter().map(|db_tx| db_tx.into()).collect(),
        })
    }
}

#[derive(Default)]
pub(crate) struct TxsHistoryMempoolQuery;

#[async_graphql::Object]
impl TxsHistoryMempoolQuery {
    /// Transactions waiting on mempool
    async fn txs_history_mp(
        &self,
        ctx: &async_graphql::Context<'_>,
        #[graphql(desc = "Ed25519 public key on base 58 representation")] pubkey: String,
    ) -> async_graphql::Result<TxsHistoryMempool> {
        let pubkey = PublicKey::from_base58(&pubkey)?;

        let data = ctx.data::<SchemaData>()?;
        let db_reader = data.dbs_reader();

        let (sending, pending) = data
            .dbs_pool
            .execute(move |dbs| db_reader.get_txs_history_mempool(&dbs.txs_mp_db, pubkey))
            .await??;

        Ok(TxsHistoryMempool {
            sending: sending
                .into_iter()
                .map(|db_tx| TxGva::from(&db_tx))
                .collect(),
            receiving: pending
                .into_iter()
                .map(|db_tx| TxGva::from(&db_tx))
                .collect(),
        })
    }
}

#[cfg(test)]
mod tests {
    use dubp::documents::transaction::TransactionDocumentV10;
    use dubp::documents::transaction::TransactionDocumentV10Stringified;
    use dubp::documents_parser::prelude::FromStringObject;
    use duniter_dbs::TxDbV2;

    use crate::tests::*;

    #[tokio::test]
    async fn test_txs_history_blockchain() -> anyhow::Result<()> {
        let mut dbs_reader = MockDbsReader::new();
        dbs_reader
            .expect_get_txs_history_bc_received()
            .times(1)
            .returning(|_| Ok(vec![]));
        dbs_reader
            .expect_get_txs_history_bc_sent()
            .times(1)
            .returning(|_| {
                let tx = TransactionDocumentV10::from_string_object(
                    &TransactionDocumentV10Stringified {
                        currency: "test".to_owned(),
                        blockstamp:
                            "0-0000000000000000000000000000000000000000000000000000000000000000"
                                .to_owned(),
                        locktime: 0,
                        issuers: vec![],
                        inputs: vec![],
                        unlocks: vec![],
                        outputs: vec![],
                        comment: "".to_owned(),
                        signatures: vec![],
                        hash: Some(
                            "0000000000000000000000000000000000000000000000000000000000000000"
                                .to_owned(),
                        ),
                    },
                )
                .expect("wrong tx");
                Ok(vec![TxDbV2 {
                    tx,
                    ..Default::default()
                }])
            });
        let schema = create_schema(dbs_reader)?;
        assert_eq!(
            exec_graphql_request(
                &schema,
                r#"{
                txsHistoryBc(pubkeyOrScript: "D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx") {
                    sent {
                        blockstamp
                    }
                    received {
                        blockstamp
                    }
                }
              }"#
            )
            .await?,
            serde_json::json!({
                "data": {
                    "txsHistoryBc": {
                        "received": [],
                        "sent": [{
                            "blockstamp": "0-0000000000000000000000000000000000000000000000000000000000000000",
                        }]
                    }
                  }
            })
        );
        Ok(())
    }
}

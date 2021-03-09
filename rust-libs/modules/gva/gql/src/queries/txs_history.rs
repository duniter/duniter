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
use duniter_gva_db::GvaTxDbV1;
use duniter_gva_dbs_reader::txs_history::TxBcCursor;
use futures::future::join;

#[derive(Default)]
pub(crate) struct TxsHistoryBlockchainQuery;

#[async_graphql::Object]
impl TxsHistoryBlockchainQuery {
    /// Transactions history (written in blockchain)
    async fn txs_history_bc(
        &self,
        #[graphql(desc = "pagination", default)] pagination: Pagination,
        script: PkOrScriptGva,
    ) -> async_graphql::Result<TxsHistoryBlockchainQueryInner> {
        let pagination = Pagination::convert_to_page_info(pagination)?;
        let script_hash = Hash::compute(script.0.to_string().as_bytes());
        Ok(TxsHistoryBlockchainQueryInner {
            pagination,
            script_hash,
        })
    }
}

pub(crate) struct TxsHistoryBlockchainQueryInner {
    pub(crate) pagination: PageInfo<TxBcCursor>,
    pub(crate) script_hash: Hash,
}

#[async_graphql::Object]
impl TxsHistoryBlockchainQueryInner {
    /// Transactions history (written in blockchain)
    async fn both(
        &self,
        ctx: &async_graphql::Context<'_>,
    ) -> async_graphql::Result<Connection<String, TxGva, EmptyFields, EdgeTx>> {
        let start_time = std::time::Instant::now();

        let data = ctx.data::<GvaSchemaData>()?;

        let db_reader = data.dbs_reader();
        let pagination = self.pagination;
        let script_hash = self.script_hash;
        let sent_fut = data
            .dbs_pool
            .execute(move |_| db_reader.get_txs_history_bc_sent(pagination, script_hash));
        let db_reader = data.dbs_reader();
        let script_hash = self.script_hash;
        let received_fut = data
            .dbs_pool
            .execute(move |_| db_reader.get_txs_history_bc_received(pagination, script_hash));
        let (sent_res, received_res) = join(sent_fut, received_fut).await;
        let (sent, received) = (sent_res??, received_res??);

        let mut both_txs = sent
            .data
            .into_iter()
            .map(|db_tx| (TxDirection::Sent, db_tx))
            .chain(
                received
                    .data
                    .into_iter()
                    .map(|db_tx| (TxDirection::Received, db_tx)),
            )
            .collect::<Vec<(TxDirection, GvaTxDbV1)>>();
        /*if let Some(TxBcCursor { tx_hash, .. }) = pagination.pos() {
            while both.txs
        }*/
        if self.pagination.order() {
            both_txs.sort_unstable_by(|(_, db_tx1), (_, db_tx2)| {
                db_tx1
                    .written_block
                    .number
                    .cmp(&db_tx2.written_block.number)
            });
        } else {
            both_txs.sort_unstable_by(|(_, db_tx1), (_, db_tx2)| {
                db_tx2
                    .written_block
                    .number
                    .cmp(&db_tx1.written_block.number)
            });
        }
        if let Some(limit) = self.pagination.limit_opt() {
            both_txs.truncate(limit);
        }
        let mut conn = Connection::new(
            sent.has_previous_page || received.has_previous_page,
            sent.has_next_page || received.has_next_page,
        );
        conn.append(both_txs.into_iter().map(|(tx_direction, db_tx)| {
            Edge::with_additional_fields(
                TxBcCursor {
                    block_number: db_tx.written_block.number,
                    tx_hash: db_tx.tx.get_hash(),
                }
                .to_string(),
                db_tx.into(),
                EdgeTx {
                    direction: tx_direction,
                },
            )
        }));

        println!(
            "txs_history_bc::both duration: {}ms",
            start_time.elapsed().as_millis()
        );

        Ok(conn)
    }
    /// Received transactions history (written in blockchain)
    async fn received(
        &self,
        ctx: &async_graphql::Context<'_>,
    ) -> async_graphql::Result<Connection<String, TxGva, EmptyFields, EmptyFields>> {
        let data = ctx.data::<GvaSchemaData>()?;
        let db_reader = data.dbs_reader();
        let pagination = self.pagination;
        let script_hash = self.script_hash;
        let received = data
            .dbs_pool
            .execute(move |_| db_reader.get_txs_history_bc_received(pagination, script_hash))
            .await??;
        let mut conn = Connection::new(received.has_previous_page, received.has_next_page);
        conn.append(received.data.into_iter().map(|db_tx| {
            Edge::new(
                TxBcCursor {
                    block_number: db_tx.written_block.number,
                    tx_hash: db_tx.tx.get_hash(),
                }
                .to_string(),
                db_tx.into(),
            )
        }));

        Ok(conn)
    }
    /// Sent transactions history (written in blockchain)
    async fn sent(
        &self,
        ctx: &async_graphql::Context<'_>,
    ) -> async_graphql::Result<Connection<String, TxGva, EmptyFields, EmptyFields>> {
        let data = ctx.data::<GvaSchemaData>()?;
        let db_reader = data.dbs_reader();
        let pagination = self.pagination;
        let script_hash = self.script_hash;
        let sent = data
            .dbs_pool
            .execute(move |_| db_reader.get_txs_history_bc_sent(pagination, script_hash))
            .await??;
        let mut conn = Connection::new(sent.has_previous_page, sent.has_next_page);
        conn.append(sent.data.into_iter().map(|db_tx| {
            Edge::new(
                TxBcCursor {
                    block_number: db_tx.written_block.number,
                    tx_hash: db_tx.tx.get_hash(),
                }
                .to_string(),
                db_tx.into(),
            )
        }));

        Ok(conn)
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
        #[graphql(desc = "Ed25519 public key on base 58 representation")] pubkey: PubKeyGva,
    ) -> async_graphql::Result<TxsHistoryMempool> {
        let data = ctx.data::<GvaSchemaData>()?;
        let db_reader = data.dbs_reader();

        let (sending, pending) = data
            .dbs_pool
            .execute(move |dbs| db_reader.get_txs_history_mempool(&dbs.txs_mp_db, pubkey.0))
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
    use std::collections::VecDeque;

    use crate::tests::*;
    use dubp::documents::transaction::TransactionDocumentV10;
    use dubp::documents::transaction::TransactionDocumentV10Stringified;
    use dubp::documents_parser::prelude::FromStringObject;
    use duniter_gva_db::GvaTxDbV1;
    use duniter_gva_dbs_reader::pagination::PagedData;

    #[tokio::test]
    async fn test_txs_history_blockchain() -> anyhow::Result<()> {
        let mut dbs_reader = MockDbsReader::new();
        dbs_reader
            .expect_get_txs_history_bc_received()
            .times(1)
            .returning(|_, _| Ok(PagedData::empty()));
        dbs_reader
            .expect_get_txs_history_bc_sent()
            .times(1)
            .returning(|_, _| {
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
                let mut expected_data = VecDeque::new();
                expected_data.push_back(GvaTxDbV1 {
                    tx,
                    ..Default::default()
                });
                Ok(PagedData {
                    data: expected_data,
                    has_previous_page: false,
                    has_next_page: false,
                })
            });
        let schema = create_schema(dbs_reader)?;
        assert_eq!(
            exec_graphql_request(
                &schema,
                r#"{
                txsHistoryBc(script: "D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx") {
                    sent {
                        edges {
                            node {
                                blockstamp
                            }
                        }
                    }
                    received {
                        edges {
                            node {
                                blockstamp
                            }
                        }
                    }
                }
              }"#
            )
            .await?,
            serde_json::json!({
                "data": {
                    "txsHistoryBc": {
                        "received": {
                            "edges": []
                        },
                        "sent": {
                            "edges": [{
                                "node": {
                                    "blockstamp": "0-0000000000000000000000000000000000000000000000000000000000000000",
                                }
                            }]
                        }
                    }
                  }
            })
        );
        Ok(())
    }
}

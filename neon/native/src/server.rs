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

use crate::into_neon_res;
use dubp::common::crypto::keys::{ed25519::PublicKey, PublicKey as _};
use dubp::documents::{
    prelude::*,
    transaction::{TransactionDocumentV10, TransactionDocumentV10Stringified},
};
use dubp::documents_parser::prelude::*;
use dubp::{common::crypto::hashs::Hash, crypto::keys::ed25519::Ed25519KeyPair};
use duniter_server::{DuniterCoreConf, DuniterMode, DuniterServer};
use neon::declare_types;
use neon::prelude::*;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub struct RustServer {
    server: DuniterServer,
}

declare_types! {
    pub class JsServer for RustServer {
        init(mut cx) {
            let rust_server_conf_js = cx.argument::<JsValue>(0)?;
            let arg1_opt = cx.argument_opt(1);

            let rust_server_conf_stringified: RustServerConfStringified = neon_serde::from_value(&mut cx, rust_server_conf_js)?;

            let currency = rust_server_conf_stringified.currency;
            let self_key_pair = if let Some(self_keypair_str) = rust_server_conf_stringified.self_keypair {
                into_neon_res(&mut cx, crate::crypto::keypair_from_expanded_base58_secret_key(&self_keypair_str))?
            } else {
                Ed25519KeyPair::generate_random().expect("fail to gen random keyypair")
            };
            let txs_mempool_size = rust_server_conf_stringified.txs_mempool_size as usize;
            let conf = DuniterCoreConf {
                self_key_pair,
                txs_mempool_size
            };

            let home_path_opt = if let Some(arg1) = arg1_opt {
                if arg1.is_a::<JsString>() {
                    let home_path_str = arg1
                        .downcast::<JsString>()
                        .or_throw(&mut cx)?
                        .value();
                    if std::env::var_os("DUNITER_JS_TESTS") == Some("yes".into()) {
                        None
                    } else {
                        Some(PathBuf::from(home_path_str))
                    }
                } else if arg1.is_a::<JsNull>() {
                    None
                } else {
                    return cx.throw_type_error("arg1 must be a string");
                }
            } else {
                None
            };
            let duniter_mode = if std::env::var_os("DUNITER_JS_TESTS") == Some("yes".into()) {
                DuniterMode::Start
            } else if let Ok(duniter_mode) = std::env::var("DUNITER_MODE") {
                match duniter_mode.as_str() {
                    "sync" => DuniterMode::Sync,
                    _ => DuniterMode::Start,
                }
            } else {
                return cx.throw_error("Env var DUNITER_MODE not exist or contain invalid utf8");
            };
            into_neon_res(
                &mut cx,
                if let Some(home_path) = home_path_opt {
                    DuniterServer::start(conf, currency, duniter_mode, Some(home_path.as_path()), std::env!("CARGO_PKG_VERSION"))
                } else {
                    DuniterServer::start(conf, currency, duniter_mode, None, std::env!("CARGO_PKG_VERSION"))
                }.map(|server| RustServer { server })
            )
        }

        // Indexing blockchain
        method revertBlock(mut cx) {
            let block_js = cx.argument::<JsValue>(0)?;

            let block_stringified: dubp::block::DubpBlockV10Stringified = neon_serde::from_value(&mut cx, block_js)?;

            let mut this = cx.this();
            let res = {
                let guard = cx.lock();
                let mut server = this.borrow_mut(&guard);
                server.server.revert_block(block_stringified)
            }.map(|()| cx.undefined().upcast());
            into_neon_res(&mut cx, res)
        }
        method applyBlock(mut cx) {
            let block_js = cx.argument::<JsValue>(0)?;

            let block_stringified: dubp::block::DubpBlockV10Stringified = neon_serde::from_value(&mut cx, block_js)?;

            let mut this = cx.this();
            let res = {
                let guard = cx.lock();
                let mut server = this.borrow_mut(&guard);
                server.server.apply_block(block_stringified)
            }.map(|()| cx.undefined().upcast());
            into_neon_res(&mut cx, res)
        }
        method applyChunkOfBlocks(mut cx) {
            let blocks_js = cx.argument::<JsValue>(0)?;

            let blocks_stringified: Vec<dubp::block::DubpBlockV10Stringified> = neon_serde::from_value(&mut cx, blocks_js)?;

            let mut this = cx.this();
            let res = {
                let guard = cx.lock();
                let mut server = this.borrow_mut(&guard);
                server.server.apply_chunk_of_blocks(blocks_stringified)
            }.map(|()| cx.undefined().upcast());
            into_neon_res(&mut cx, res)
        }


        // Rust Endpoints (GVA, etc)
        method getSelfEndpoints(mut cx) {
            let this = cx.this();
            let res = {
                let guard = cx.lock();
                let server = this.borrow(&guard);
                server.server.get_self_endpoints()
            }.map(|endpoints| {
                log::debug!("rust-server: get_self_endpoints: {:?}", endpoints);
                let js_array = JsArray::new(&mut cx, endpoints.len() as u32);
                for (i, ep) in endpoints.iter().enumerate() {
                    let js_string = cx.string(ep);
                    js_array.set(&mut cx, i as u32, js_string).expect("fail to convert Vec<String> to JsArray");
                }
                js_array.upcast()
            });
            into_neon_res(&mut cx, res)
        }


        // Txs mempool
        method acceptNewTx(mut cx) {
            let tx_js = cx.argument::<JsValue>(0)?;
            let server_pubkey_str = cx.argument::<JsString>(1)?.value();

            let tx_str: TransactionDocumentV10Stringified = neon_serde::from_value(&mut cx, tx_js)?;
            let tx = into_neon_res(&mut cx, TransactionDocumentV10::from_string_object(&tx_str))?;
            let server_pubkey = into_neon_res(&mut cx, PublicKey::from_base58(&server_pubkey_str))?;

            let this = cx.this();
            let res = {
                let guard = cx.lock();
                let server = this.borrow(&guard);
                server.server.accept_new_tx(tx, server_pubkey)
            }.map(|accepted| cx.boolean(accepted).upcast());
            into_neon_res(&mut cx, res)
        }
        method addPendingTx(mut cx) {
            let tx_js = cx.argument::<JsValue>(0)?;

            let tx_str: TransactionDocumentV10Stringified = neon_serde::from_value(&mut cx, tx_js)?;
            let tx = into_neon_res(&mut cx, TransactionDocumentV10::from_string_object(&tx_str))?;

            let this = cx.this();
            let res = {
                let guard = cx.lock();
                let server = this.borrow(&guard);
                server.server.add_pending_tx_force(tx)
            }.map(|_| cx.undefined().upcast());
            into_neon_res(&mut cx, res)
        }
        method getMempoolTxsFreeRooms(mut cx) {
            let this = cx.this();
            let res = {
                let guard = cx.lock();
                let server = this.borrow(&guard);
                server.server.get_mempool_txs_free_rooms()
            }.map(|free_rooms| cx.number(free_rooms as f64).upcast());
            into_neon_res(&mut cx, res)
        }
        method getNewPendingTxs(mut cx) {
            let this = cx.this();
            let res = {
                let guard = cx.lock();
                let server = this.borrow(&guard);
                server.server.get_new_pending_txs()
            };
            match res {
                Ok(txs) => {
                    let txs: Vec<_> = txs.into_iter().map(|tx| tx.to_string_object()).collect();
                    Ok(neon_serde::to_value(&mut cx, &txs)?)
                },
                Err(e) => cx.throw_error(format!("{}", e)),
            }
        }
        method getTransactionsPending(mut cx) {
            let min_version = cx.argument::<JsNumber>(0)?.value() as usize;
            let blockchain_time = cx.argument::<JsNumber>(1)?.value() as i64;

            let this = cx.this();
            let res = {
                let guard = cx.lock();
                let server = this.borrow(&guard);
                server.server.get_pending_txs(blockchain_time, min_version)
            };
            match res {
                Ok(txs) => {
                    let txs: Vec<_> = txs.into_iter().map(|tx| tx.0.to_string_object()).collect();
                    Ok(neon_serde::to_value(&mut cx, &txs)?)
                },
                Err(e) => cx.throw_error(format!("{}", e)),
            }
        }
        method removeAllPendingTxs(mut cx) {
            let this = cx.this();
            let res = {
                let guard = cx.lock();
                let server = this.borrow(&guard);
                server.server.remove_all_pending_txs()
            }.map(|()| cx.undefined().upcast());
            into_neon_res(&mut cx, res)
        }
        method removePendingTxByHash(mut cx) {
            let hash_str = cx.argument::<JsString>(0)?.value();
            let hash = into_neon_res(&mut cx, Hash::from_hex(&hash_str))?;

            let this = cx.this();
            let res = {
                let guard = cx.lock();
                let server = this.borrow(&guard);
                server.server.remove_pending_tx_by_hash(hash)
            }.map(|()| cx.undefined().upcast());
            into_neon_res(&mut cx, res)
        }
        method trimExpiredNonWrittenTxs(mut cx) {
            let limit_time = cx.argument::<JsNumber>(0)?.value() as i64;

            let this = cx.this();
            let res = {
                let guard = cx.lock();
                let server = this.borrow(&guard);
                server.server.trim_expired_non_written_txs(limit_time)
            }.map(|()| cx.undefined().upcast());
            into_neon_res(&mut cx, res)
        }

        // Transactions history (for BMA only)
        method getTransactionsHistory(mut cx) {
            let pubkey_str = cx.argument::<JsString>(0)?.value();
            let pubkey = into_neon_res(&mut cx, PublicKey::from_base58(&pubkey_str))?;

            let this = cx.this();
            let res = {
                let guard = cx.lock();
                let server = this.borrow(&guard);
                server.server.get_transactions_history(pubkey)
            };
            match res {
                Ok(txs_history) => {
                    let sent: Vec<_> = txs_history.sent
                        .into_iter()
                        .map(|(tx, wb, wt)| DbTx::v10(tx.to_string_object(), tx.get_hash(), wb.number.0, wt))
                        .collect();
                    let received: Vec<_> = txs_history.received
                        .into_iter()
                        .map(|(tx, wb, wt)| DbTx::v10(tx.to_string_object(), tx.get_hash(), wb.number.0, wt))
                        .collect();
                    let sending: Vec<_> = txs_history.sending.into_iter().map(|tx| tx.to_string_object()).collect();
                    let pending: Vec<_> = txs_history.pending.into_iter().map(|tx| tx.to_string_object()).collect();

                    Ok(neon_serde::to_value(&mut cx, &TxsHistoryStringified {
                        sent,
                        received,
                        sending,
                        pending
                    })?)
                },
                Err(e) => cx.throw_error(format!("{}", e)),
            }
        }
        method getTxByHash(mut cx) {
            let hash_str = cx.argument::<JsString>(0)?.value();
            let hash = into_neon_res(&mut cx, Hash::from_hex(&hash_str))?;

            let this = cx.this();
            let res = {
                let guard = cx.lock();
                let server = this.borrow(&guard);
                server.server.get_tx_by_hash(hash)
            };
            match res {
                Ok(tx_opt) => if let Some((tx, written_block_opt)) = tx_opt {
                    let tx_js = neon_serde::to_value(&mut cx, &tx.to_string_object())?;
                    if let Some(written_block) = written_block_opt {
                        let written_block =  cx.number(written_block.0);
                        let tx_js = tx_js.downcast_or_throw::<JsObject, _>(&mut cx)?;
                        tx_js.set(&mut cx, "writtenBlock", written_block)?;
                    }
                    Ok(tx_js.upcast())
                } else {
                    Ok(cx.null().upcast())
                },
                Err(e) => cx.throw_error(format!("{}", e)),
            }
        }

        // WS2Pv1: HEADs and peers
        method receiveNewHeads(mut cx) {
            let heads_js = cx.argument::<JsValue>(0)?;

            let heads_stringified: Vec<HeadWS2Pv1ConfStringified> = neon_serde::from_value(&mut cx, heads_js)?;

            use duniter_server::{DunpNodeIdV1Db, DunpHeadDbV1, KvResult};
            let heads = into_neon_res(&mut cx, heads_stringified.into_iter().map(|HeadWS2Pv1ConfStringified { message_v2, sig_v2, .. }| {
                DunpHeadDbV1::from_stringified(&message_v2.unwrap_or_default(), &sig_v2.unwrap_or_default())
            }).collect::<KvResult<Vec<(DunpNodeIdV1Db, DunpHeadDbV1)>>>())?;

            let this = cx.this();
            let res = {
                let guard = cx.lock();
                let server = this.borrow(&guard);
                server.server.receive_new_heads(heads)
            }.map(|()| cx.undefined().upcast());
            into_neon_res(&mut cx, res)
        }
        method removeAllPeers(mut cx) {
            let this = cx.this();
            let res = {
                let guard = cx.lock();
                let server = this.borrow(&guard);
                server.server.remove_all_peers()
            }.map(|()| cx.undefined().upcast());
            into_neon_res(&mut cx, res)
        }
        method removePeerByPubkey(mut cx) {
            let pubkey_str = cx.argument::<JsString>(0)?.value();
            let pubkey = into_neon_res(&mut cx, PublicKey::from_base58(&pubkey_str))?;

            let this = cx.this();
            let res = {
                let guard = cx.lock();
                let server = this.borrow(&guard);
                server.server.remove_peer_by_pubkey(pubkey)
            }.map(|()| cx.undefined().upcast());
            into_neon_res(&mut cx, res)
        }
        method savePeer(mut cx) {
            let peer_js = cx.argument::<JsValue>(0)?;

            let peer_stringified: PeerCardStringified = neon_serde::from_value(&mut cx, peer_js)?;
            let peer = duniter_server::PeerCardDbV1 {
                version: peer_stringified.version,
                currency: peer_stringified.currency,
                pubkey: peer_stringified.pubkey,
                blockstamp: peer_stringified.blockstamp,
                endpoints: peer_stringified.endpoints,
                status: peer_stringified.status,
                signature: peer_stringified.signature,
            };

            let this = cx.this();
            let res = {
                let guard = cx.lock();
                let server = this.borrow(&guard);
                server.server.save_peer(peer)
            }.map(|()| cx.undefined().upcast());
            into_neon_res(&mut cx, res)
        }
        method updateSelfPeer(mut cx) {
            let peer_js = cx.argument::<JsValue>(0)?;

            let peer_stringified: PeerCardStringified = neon_serde::from_value(&mut cx, peer_js)?;
            let peer = duniter_server::PeerCardDbV1 {
                version: peer_stringified.version,
                currency: peer_stringified.currency,
                pubkey: peer_stringified.pubkey,
                blockstamp: peer_stringified.blockstamp,
                endpoints: peer_stringified.endpoints,
                status: peer_stringified.status,
                signature: peer_stringified.signature,
            };

            let this = cx.this();
            {
                let guard = cx.lock();
                let server = this.borrow(&guard);
                server.server.update_self_peer(peer)
            };
            Ok(cx.undefined().upcast())
        }
    }
}

#[derive(Clone, Debug, Deserialize, Hash, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DbTx {
    pub version: u32,
    pub currency: String,
    pub blockstamp: String,
    pub locktime: u64,
    pub issuers: Vec<String>,
    pub inputs: Vec<String>,
    pub unlocks: Vec<String>,
    pub outputs: Vec<String>,
    pub comment: String,
    pub signatures: Vec<String>,
    pub hash: String,
    pub written_block_number: u32,
    pub written_time: i64,
}

impl DbTx {
    pub fn v10(
        tx_doc: TransactionDocumentV10Stringified,
        tx_hash: Hash,
        written_block_number: u32,
        written_time: i64,
    ) -> Self {
        DbTx {
            version: 10,
            currency: tx_doc.currency,
            blockstamp: tx_doc.blockstamp,
            locktime: tx_doc.locktime,
            issuers: tx_doc.issuers,
            inputs: tx_doc.inputs,
            unlocks: tx_doc.unlocks,
            outputs: tx_doc.outputs,
            comment: tx_doc.comment,
            signatures: tx_doc.signatures,
            hash: tx_hash.to_hex(),
            written_block_number,
            written_time,
        }
    }
}

#[allow(clippy::upper_case_acronyms)]
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct HeadWS2Pv1ConfStringified {
    message_v2: Option<String>,
    sig_v2: Option<String>,
    step: Option<usize>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerCardStringified {
    pub version: u32,
    pub currency: String,
    pub pubkey: String,
    pub blockstamp: String,
    pub endpoints: Vec<String>,
    pub status: String,
    pub signature: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RustServerConfStringified {
    currency: String,
    self_keypair: Option<String>,
    txs_mempool_size: u32,
}

#[derive(Deserialize, Serialize)]
struct TxsHistoryStringified {
    sent: Vec<DbTx>,
    received: Vec<DbTx>,
    sending: Vec<TransactionDocumentV10Stringified>,
    pending: Vec<TransactionDocumentV10Stringified>,
}

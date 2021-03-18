//  Copyright (C) 2020 Éloïs  req_id: (), resp_type: ()SANCHEZ.
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

#![deny(
    clippy::unwrap_used,
    missing_copy_implementations,
    trivial_casts,
    trivial_numeric_casts,
    unstable_features,
    unused_import_braces
)]

mod exec_req_type;

const RESP_MIN_SIZE: usize = 64;
type RespBytes = SmallVec<[u8; RESP_MIN_SIZE]>;

use crate::exec_req_type::ExecReqTypeError;
use async_bincode::AsyncBincodeReader;
use async_io_stream::IoStream;
use bincode::Options as _;
use dubp::crypto::keys::{ed25519::Ed25519KeyPair, Signator};
use duniter_bca_types::{
    bincode_opts, BcaReq, BcaReqExecError, BcaReqTypeV0, BcaResp, BcaRespTypeV0, BcaRespV0,
};
use duniter_dbs::{FileBackend, SharedDbs};
use futures::{prelude::stream::FuturesUnordered, StreamExt, TryStream, TryStreamExt};
use once_cell::sync::OnceCell;
use smallvec::SmallVec;
use tokio::task::JoinError;

#[cfg(test)]
use crate::tests::DbsReader;
#[cfg(not(test))]
use duniter_gva_dbs_reader::DbsReader;

static BCA_EXECUTOR: OnceCell<BcaExecutor> = OnceCell::new();

pub fn set_bca_executor(
    currency: String,
    dbs_pool: fast_threadpool::ThreadPoolAsyncHandler<SharedDbs<FileBackend>>,
    dbs_reader: DbsReader,
    self_keypair: Ed25519KeyPair,
    software_version: &'static str,
) {
    BCA_EXECUTOR
        .set(BcaExecutor {
            currency,
            dbs_pool,
            dbs_reader,
            self_keypair,
            software_version,
        })
        .unwrap_or_else(|_| panic!("BCA_EXECUTOR already set !"))
}

#[cfg(not(test))]
pub async fn execute<B, S>(query_body_stream: S, is_whitelisted: bool) -> Vec<u8>
where
    B: AsRef<[u8]>,
    S: 'static + TryStream<Ok = B, Error = std::io::Error> + Send + Unpin,
{
    unsafe {
        BCA_EXECUTOR
            .get_unchecked()
            .execute(query_body_stream, is_whitelisted)
            .await
    }
}

#[derive(Clone)]
struct BcaExecutor {
    currency: String,
    dbs_pool: fast_threadpool::ThreadPoolAsyncHandler<SharedDbs<FileBackend>>,
    dbs_reader: DbsReader,
    self_keypair: Ed25519KeyPair,
    software_version: &'static str,
}
use uninit::extension_traits::VecCapacity;
impl BcaExecutor {
    pub async fn execute<B, S>(&self, query_body_stream: S, is_whitelisted: bool) -> Vec<u8>
    where
        B: AsRef<[u8]>,
        S: 'static + TryStream<Ok = B, Error = std::io::Error> + Send + Unpin,
    {
        let async_bincode_reader =
            AsyncBincodeReader::<IoStream<S, B>, BcaReq>::from(IoStream::new(query_body_stream));
        self.execute_inner(async_bincode_reader, is_whitelisted)
            .await
            .into_iter()
            .fold(Vec::new(), |mut vec, elem| {
                // Write resp len
                let out = vec.reserve_uninit(4);
                out.copy_from_slice(&u32::to_be_bytes(elem.len() as u32)[..]);
                unsafe {
                    // # Safety
                    //
                    //   - `.copy_from_slice()` contract guarantees initialization
                    //     of `out`, which, in turn, from `reserve_uninit`'s contract,
                    //     leads to the `vec` extra capacity having been initialized.
                    vec.set_len(vec.len() + 4);
                }

                // Write resp content
                let out = vec.reserve_uninit(elem.len());
                out.copy_from_slice(&elem[..]);
                unsafe {
                    // # Safety
                    //
                    //   - `.copy_from_slice()` contract guarantees initialization
                    //     of `out`, which, in turn, from `reserve_uninit`'s contract,
                    //     leads to the `vec` extra capacity having been initialized.
                    vec.set_len(vec.len() + elem.len());
                }
                vec
            })
    }
    async fn execute_inner(
        &self,
        stream: impl TryStream<Ok = BcaReq, Error = bincode::Error>,
        is_whitelisted: bool,
    ) -> Vec<RespBytes> {
        match stream
            .map_ok(|req| {
                let self_clone = self.clone();
                tokio::spawn(async move { self_clone.execute_req(req, is_whitelisted).await })
            })
            .try_collect::<FuturesUnordered<_>>()
            .await
        {
            Ok(futures_unordered) => {
                futures_unordered
                    .map(|req_res: Result<BcaResp, JoinError>| {
                        let resp = match req_res {
                            Ok(resp) => Ok(resp),
                            Err(e) => Err(if e.is_cancelled() {
                                BcaReqExecError::Cancelled
                            } else if e.is_panic() {
                                BcaReqExecError::Panic
                            } else {
                                BcaReqExecError::Unknown
                            }),
                        };
                        let mut resp_buffer = RespBytes::new();
                        bincode_opts()
                            .serialize_into(&mut resp_buffer, &resp)
                            .expect("unreachable");
                        resp_buffer
                    })
                    .collect()
                    .await
            }
            Err(e) => {
                let req_res: Result<BcaResp, BcaReqExecError> =
                    Err(BcaReqExecError::InvalidReq(e.to_string()));
                let mut resp_buffer = RespBytes::new();
                bincode_opts()
                    .serialize_into(&mut resp_buffer, &req_res)
                    .expect("unreachable");
                vec![resp_buffer]
            }
        }
    }

    #[inline(always)]
    async fn execute_req(self, req: BcaReq, is_whitelisted: bool) -> BcaResp {
        match req {
            BcaReq::V0(req) => BcaResp::V0(BcaRespV0 {
                req_id: req.req_id,
                resp_type: match crate::exec_req_type::execute_req_type(
                    &self,
                    req.req_type,
                    is_whitelisted,
                )
                .await
                {
                    Ok(resp_type) => resp_type,
                    Err(e) => BcaRespTypeV0::Error(e.0),
                },
            }),
            _ => BcaResp::UnsupportedVersion,
        }
    }
}

#[cfg(not(test))]
impl BcaExecutor {
    #[inline(always)]
    pub fn dbs_reader(&self) -> DbsReader {
        self.dbs_reader
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    pub use dubp::{
        block::prelude::*,
        crypto::{
            hashs::Hash,
            keys::{ed25519::PublicKey, KeyPair, Seed32},
        },
        documents::transaction::TransactionInputV10,
        wallet::prelude::*,
    };
    pub use duniter_bca_types::BcaReqV0;
    pub use duniter_dbs::databases::bc_v2::{BcV2DbReadable, BcV2DbRo};
    pub use duniter_dbs::databases::cm_v1::{CmV1Db, CmV1DbReadable};
    pub use duniter_dbs::databases::txs_mp_v2::{TxsMpV2Db, TxsMpV2DbReadable};
    pub use duniter_dbs::kv_typed::prelude::*;
    pub use duniter_dbs::BlockMetaV2;
    pub use futures::TryStreamExt;

    mockall::mock! {
        pub DbsReader {
            fn find_inputs<BcDb: 'static + BcV2DbReadable, TxsMpDb: 'static + TxsMpV2DbReadable>(
                &self,
                bc_db: &BcDb,
                txs_mp_db: &TxsMpDb,
                amount: SourceAmount,
                script: &WalletScriptV10,
                use_mempool_sources: bool,
            ) -> anyhow::Result<(Vec<TransactionInputV10>, SourceAmount)>;
            fn get_current_block<CmDb: 'static + CmV1DbReadable>(
                &self,
                cm_db: &CmDb,
            ) -> KvResult<Option<DubpBlockV10>>;
            fn get_current_block_meta<CmDb: 'static + CmV1DbReadable>(
                &self,
                cm_db: &CmDb,
            ) -> KvResult<Option<BlockMetaV2>>;
        }
    }

    pub type DbsReader = duniter_dbs::kv_typed::prelude::Arc<MockDbsReader>;

    impl BcaExecutor {
        #[inline(always)]
        pub fn dbs_reader(&self) -> DbsReader {
            self.dbs_reader.clone()
        }
    }

    pub(crate) fn create_bca_executor(mock_dbs_reader: MockDbsReader) -> KvResult<BcaExecutor> {
        let dbs = SharedDbs::mem()?;
        let threadpool =
            fast_threadpool::ThreadPool::start(fast_threadpool::ThreadPoolConfig::low(), dbs);
        Ok(BcaExecutor {
            currency: "g1".to_owned(),
            dbs_pool: threadpool.into_async_handler(),
            dbs_reader: duniter_dbs::kv_typed::prelude::Arc::new(mock_dbs_reader),
            self_keypair: Ed25519KeyPair::from_seed(
                Seed32::random().expect("fail to gen random seed"),
            ),
            software_version: "test",
        })
    }

    pub(crate) fn io_stream<B: AsRef<[u8]>>(
        bytes: B,
    ) -> impl TryStream<Ok = B, Error = std::io::Error> {
        futures::stream::iter(std::iter::once(Ok(bytes)))
    }

    #[tokio::test]
    async fn test_one_req_ok() -> Result<(), bincode::Error> {
        let req = BcaReq::V0(BcaReqV0 {
            req_id: 42,
            req_type: BcaReqTypeV0::MembersCount,
        });
        assert_eq!(bincode_opts().serialized_size(&req)?, 3);
        let mut bytes = [0u8; 7];

        bincode_opts().serialize_into(&mut bytes[4..], &req)?;
        bytes[3] = 3;

        use bincode::Options;
        //println!("bytes_for_bincode={:?}", &bytes[4..]);
        assert_eq!(req, bincode_opts().deserialize(&bytes[4..])?);

        let mut dbs_reader = MockDbsReader::new();
        dbs_reader
            .expect_get_current_block::<CmV1Db<MemSingleton>>()
            .times(1)
            .returning(|_| Ok(Some(DubpBlockV10::default())));
        let bca_executor = create_bca_executor(dbs_reader).expect("fail to create bca executor");

        //println!("bytes={:?}", bytes);
        let bytes_res = bca_executor.execute(io_stream(bytes), false).await;
        //println!("bytes_res={:?}", bytes_res);
        let bca_res: Vec<Result<BcaResp, BcaReqExecError>> =
            AsyncBincodeReader::<_, Result<BcaResp, BcaReqExecError>>::from(&bytes_res[..])
                .try_collect::<Vec<_>>()
                .await?;

        assert_eq!(
            bca_res,
            vec![Ok(BcaResp::V0(BcaRespV0 {
                req_id: 42,
                resp_type: BcaRespTypeV0::MembersCount(0)
            }))]
        );

        Ok(())
    }

    #[tokio::test]
    async fn test_one_req_invalid() -> Result<(), bincode::Error> {
        let req = BcaReq::V0(BcaReqV0 {
            req_id: 42,
            req_type: BcaReqTypeV0::MembersCount,
        });
        assert_eq!(bincode_opts().serialized_size(&req)?, 3);
        let mut bytes = [0u8; 7];

        bincode_opts().serialize_into(&mut bytes[4..], &req)?;
        bytes[3] = 2;

        use bincode::Options;
        //println!("bytes_for_bincode={:?}", &bytes[4..]);
        assert_eq!(req, bincode_opts().deserialize(&bytes[4..])?);

        let bca_executor =
            create_bca_executor(MockDbsReader::new()).expect("fail to create bca executor");

        //println!("bytes={:?}", bytes);
        let bytes_res = bca_executor.execute(io_stream(bytes), false).await;
        //println!("bytes_res={:?}", bytes_res);
        let bca_res: Vec<Result<BcaResp, BcaReqExecError>> =
            AsyncBincodeReader::<_, Result<BcaResp, BcaReqExecError>>::from(&bytes_res[..])
                .try_collect::<Vec<_>>()
                .await?;

        assert_eq!(
            bca_res,
            vec![Err(BcaReqExecError::InvalidReq(
                "io error: unexpected end of file".to_owned()
            ))]
        );

        Ok(())
    }

    #[tokio::test]
    async fn test_two_reqs_ok() -> Result<(), bincode::Error> {
        let req1 = BcaReq::V0(BcaReqV0 {
            req_id: 42,
            req_type: BcaReqTypeV0::Ping,
        });
        assert_eq!(bincode_opts().serialized_size(&req1)?, 3);
        let req2 = BcaReq::V0(BcaReqV0 {
            req_id: 57,
            req_type: BcaReqTypeV0::MembersCount,
        });
        assert_eq!(bincode_opts().serialized_size(&req2)?, 3);

        let mut bytes = [0u8; 14];
        bincode_opts().serialize_into(&mut bytes[4..], &req1)?;
        bytes[3] = 3;
        bincode_opts().serialize_into(&mut bytes[11..], &req2)?;
        bytes[10] = 3;

        let mut dbs_reader = MockDbsReader::new();
        dbs_reader
            .expect_get_current_block::<CmV1Db<MemSingleton>>()
            .times(1)
            .returning(|_| Ok(Some(DubpBlockV10::default())));
        let bca_executor = create_bca_executor(dbs_reader).expect("fail to create bca executor");

        //println!("bytes={:?}", bytes);
        let bytes_res = bca_executor.execute(io_stream(bytes), false).await;
        //println!("bytes_res={:?}", bytes_res);
        let bca_res: Vec<Result<BcaResp, BcaReqExecError>> =
            AsyncBincodeReader::<_, Result<BcaResp, BcaReqExecError>>::from(&bytes_res[..])
                .try_collect::<Vec<_>>()
                .await?;

        assert_eq!(
            bca_res,
            vec![
                Ok(BcaResp::V0(BcaRespV0 {
                    req_id: 42,
                    resp_type: BcaRespTypeV0::Pong
                })),
                Ok(BcaResp::V0(BcaRespV0 {
                    req_id: 57,
                    resp_type: BcaRespTypeV0::MembersCount(0)
                }))
            ]
        );

        Ok(())
    }
}

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

#![deny(
    clippy::unwrap_used,
    missing_copy_implementations,
    trivial_casts,
    trivial_numeric_casts,
    unstable_features,
    unused_import_braces
)]

use dubp::{
    block::DubpBlockV10,
    common::prelude::{BlockNumber, Blockstamp},
    crypto::{hashs::Hash, keys::ed25519::PublicKey},
    documents::transaction::TransactionDocumentV10,
};
use duniter_conf::DuniterConf;
use duniter_dbs::{kv_typed::prelude::*, FileBackend, SharedDbs};
use duniter_mempools::Mempools;
use std::path::Path;

pub const SOFTWARE_NAME: &str = "duniter";

pub type Endpoint = String;

#[async_trait::async_trait]
pub trait DuniterModule: 'static + Sized {
    const INDEX_BLOCKS: bool = false;

    /// This function is called only if Self::INDEX_BLOCKS is true,
    /// in this case it must be reimplemented because the default implementation panics.
    fn apply_block(
        _block: &DubpBlockV10,
        _conf: &duniter_conf::DuniterConf,
        _profile_path_opt: Option<&Path>,
    ) -> KvResult<()> {
        unreachable!()
    }

    /// This function is called only if Self::INDEX_BLOCKS is true,
    /// in this case it must be reimplemented because the default implementation panics.
    fn revert_block(
        _block: &DubpBlockV10,
        _conf: &duniter_conf::DuniterConf,
        _profile_path_opt: Option<&Path>,
    ) -> KvResult<()> {
        unreachable!()
    }

    fn init(
        conf: &DuniterConf,
        currency: &str,
        dbs_pool: &fast_threadpool::ThreadPoolAsyncHandler<SharedDbs<FileBackend>>,
        mempools: Mempools,
        profile_path_opt: Option<&Path>,
        software_version: &'static str,
    ) -> anyhow::Result<(Self, Vec<Endpoint>)>;

    async fn start(self) -> anyhow::Result<()>;

    // Needed for BMA only, will be removed when the migration is complete.
    #[doc(hidden)]
    fn get_transactions_history_for_bma(
        _dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<SharedDbs<FileBackend>>,
        _profile_path_opt: Option<&Path>,
        _pubkey: PublicKey,
    ) -> KvResult<Option<TxsHistoryForBma>> {
        Ok(None)
    }
    // Needed for BMA only, will be removed when the migration is complete.
    #[doc(hidden)]
    fn get_tx_by_hash(
        _dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<SharedDbs<FileBackend>>,
        _hash: Hash,
        _profile_path_opt: Option<&Path>,
    ) -> KvResult<Option<(TransactionDocumentV10, Option<BlockNumber>)>> {
        Ok(None)
    }
}

// Needed for BMA only, will be removed when the migration is complete.
#[doc(hidden)]
#[derive(Default)]
pub struct TxsHistoryForBma {
    pub sent: Vec<(TransactionDocumentV10, Blockstamp, i64)>,
    pub received: Vec<(TransactionDocumentV10, Blockstamp, i64)>,
    pub sending: Vec<TransactionDocumentV10>,
    pub pending: Vec<TransactionDocumentV10>,
}

#[macro_export]
macro_rules! plug_duniter_modules {
    ([$($M:ty),*], $TxsHistoryForBma:ident) => {
        paste::paste! {
            use anyhow::Context as _;
            #[allow(dead_code)]
            fn apply_block_modules(
                block: Arc<DubpBlockV10>,
                conf: Arc<duniter_conf::DuniterConf>,
                dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<SharedDbs<FileBackend>>,
                profile_path_opt: Option<std::path::PathBuf>,
            ) -> KvResult<()> {
                $(
                    let [<$M:snake>] = if <$M>::INDEX_BLOCKS {
                        let block_arc_clone = Arc::clone(&block);
                        let conf_arc_clone = Arc::clone(&conf);
                        let profile_path_opt_clone = profile_path_opt.clone();
                        Some(dbs_pool
                        .launch(move |_| <$M>::apply_block(
                            &block_arc_clone,
                            &conf_arc_clone,
                            profile_path_opt_clone.as_deref()
                        ))
                        .expect("thread pool disconnected"))
                    } else {
                        None
                    };
                )*
                $(
                    if let Some(join_handle) = [<$M:snake>] {
                        join_handle.join().expect("thread pool disconnected")?;
                    }
                )*
                Ok(())
            }
            #[allow(dead_code)]
            fn apply_chunk_of_blocks_modules(
                blocks: Arc<[DubpBlockV10]>,
                conf: Arc<duniter_conf::DuniterConf>,
                dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<SharedDbs<FileBackend>>,
                profile_path_opt: Option<std::path::PathBuf>,
            ) -> KvResult<()> {
                $(
                    let [<$M:snake>] = if <$M>::INDEX_BLOCKS {
                        let blocks_arc_clone = Arc::clone(&blocks);
                        let conf_arc_clone = Arc::clone(&conf);
                        let profile_path_opt_clone = profile_path_opt.clone();
                        Some(dbs_pool
                            .launch(move |_| {
                                use std::ops::Deref as _;
                                for block in blocks_arc_clone.deref() {
                                    <$M>::apply_block(&block, &conf_arc_clone, profile_path_opt_clone.as_deref())?;
                                }
                                Ok::<_, KvError>(())
                            })
                            .expect("thread pool disconnected"))
                    } else {
                        None
                    };
                )*
                $(
                    if let Some(join_handle) = [<$M:snake>] {
                        join_handle.join().expect("thread pool disconnected")?;
                    }
                )*
                Ok(())
            }
            #[allow(dead_code)]
            fn revert_block_modules(
                block: Arc<DubpBlockV10>,
                conf: Arc<duniter_conf::DuniterConf>,
                dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<SharedDbs<FileBackend>>,
                profile_path_opt: Option<std::path::PathBuf>,
            ) -> KvResult<()> {
                $(
                    let [<$M:snake>] = if <$M>::INDEX_BLOCKS {
                        let block_arc_clone = Arc::clone(&block);
                        let conf_arc_clone = Arc::clone(&conf);
                        let profile_path_opt_clone = profile_path_opt.clone();
                        Some(dbs_pool
                        .launch(move |_| <$M>::revert_block(
                            &block_arc_clone,
                            &conf_arc_clone,
                            profile_path_opt_clone.as_deref()
                        ))
                        .expect("thread pool disconnected"))
                    } else {
                        None
                    };
                )*
                $(
                    if let Some(join_handle) = [<$M:snake>] {
                        join_handle.join().expect("thread pool disconnected")?;
                    }
                )*
                Ok(())
            }
            async fn start_duniter_modules(
                conf: &DuniterConf,
                currency: String,
                dbs_pool: fast_threadpool::ThreadPoolAsyncHandler<SharedDbs<FileBackend>>,
                mempools: duniter_mempools::Mempools,
                profile_path_opt: Option<std::path::PathBuf>,
                software_version: &'static str,
            ) -> anyhow::Result<()> {
                let mut all_endpoints = Vec::<String>::new();
                $(
                    let ([<$M:snake>], mut endpoints) =<$M>::init(conf, &currency, &dbs_pool, mempools, profile_path_opt.as_deref(), software_version)
                        .with_context(|| format!("Fail to init module '{}'", stringify!($M)))?;
                    all_endpoints.append(&mut endpoints);
                )*

                let self_peer = duniter_dbs::PeerCardDbV1 {
                    version: 10,
                    currency,
                    endpoints: all_endpoints,
                    ..Default::default()
                };

                use duniter_dbs::databases::cm_v1::CmV1DbWritable as _;
                use duniter_dbs::kv_typed::prelude::DbCollectionRw as _;
                dbs_pool.execute(|dbs| dbs.cm_db.self_peer_old_write().upsert((), self_peer)).await?.context("fail to save self peer card")?;

                $(
                    let [<$M:snake _handle>] = tokio::spawn([<$M:snake>].start());
                )*

                $(
                    [<$M:snake _handle>].await.map_err(|e| if e.is_cancelled() {
                        anyhow::Error::msg(format!("Module '{}' cancelled", stringify!($M)))
                    } else {
                        anyhow::Error::msg(format!("Module '{}' panic", stringify!($M)))
                    })?
                    .with_context(|| format!("Error on execution of module '{}'", stringify!($M)))?;
                )*

                Ok(())
            }

            // Needed for BMA only, will be removed when the migration is complete.
            #[allow(dead_code)]
            #[doc(hidden)]
            fn get_transactions_history_for_bma(
                dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<SharedDbs<FileBackend>>,
                profile_path_opt: Option<&Path>,
                pubkey: PublicKey,
            ) -> KvResult<TxsHistoryForBma> {
                $(
                    if let Some(txs_history) = <$M>::get_transactions_history_for_bma(dbs_pool, profile_path_opt, pubkey)? {
                        return Ok(txs_history);
                    }
                )*
                Ok(TxsHistoryForBma::default())
            }
            // Needed for BMA only, will be removed when the migration is complete.
            #[allow(dead_code)]
            #[doc(hidden)]
            fn get_tx_by_hash(
                dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<SharedDbs<FileBackend>>,
                hash: Hash,
                profile_path_opt: Option<&Path>,
            ) -> KvResult<Option<(TransactionDocumentV10, Option<BlockNumber>)>> {
                $(
                    if let Some(tx_with_wb) = <$M>::get_tx_by_hash(dbs_pool, hash, profile_path_opt)? {
                        return Ok(Some(tx_with_wb));
                    }
                )*
                Ok(None)
            }
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    use duniter_mempools::TxsMempool;

    struct TestMod1;

    #[async_trait::async_trait]
    impl DuniterModule for TestMod1 {
        fn init(
            _conf: &DuniterConf,
            _currency: &str,
            _dbs_pool: &fast_threadpool::ThreadPoolAsyncHandler<SharedDbs<FileBackend>>,
            _mempools: Mempools,
            profile_path_opt: Option<&Path>,
            _software_version: &'static str,
        ) -> anyhow::Result<(Self, Vec<Endpoint>)> {
            if let Some(profile_path) = profile_path_opt {
                let _file_path = profile_path.join("test_mod1.json");
            }
            Ok((TestMod1, vec![]))
        }

        async fn start(self) -> anyhow::Result<()> {
            Ok(())
        }
    }

    struct TestMod2;

    #[async_trait::async_trait]
    impl DuniterModule for TestMod2 {
        fn init(
            _conf: &DuniterConf,
            _currency: &str,
            _dbs_pool: &fast_threadpool::ThreadPoolAsyncHandler<SharedDbs<FileBackend>>,
            _mempools: Mempools,
            _profile_path_opt: Option<&Path>,
            _software_version: &'static str,
        ) -> anyhow::Result<(Self, Vec<Endpoint>)> {
            Ok((TestMod2, vec![]))
        }

        async fn start(self) -> anyhow::Result<()> {
            Ok(())
        }
    }

    #[tokio::test]
    async fn test_macro_plug_duniter_modules() -> anyhow::Result<()> {
        plug_duniter_modules!([TestMod1, TestMod2], TxsHistoryForBma);

        let dbs = SharedDbs::mem()?;
        let threadpool =
            fast_threadpool::ThreadPool::start(fast_threadpool::ThreadPoolConfig::default(), dbs);

        start_duniter_modules(
            &DuniterConf::default(),
            "test".to_owned(),
            threadpool.into_async_handler(),
            Mempools {
                txs: TxsMempool::new(0),
            },
            None,
            "",
        )
        .await?;
        Ok(())
    }
}

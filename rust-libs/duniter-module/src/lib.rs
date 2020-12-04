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

use dubp::block::DubpBlockV10;
use duniter_conf::DuniterConf;
use duniter_dbs::{kv_typed::prelude::*, DuniterDbs, FileBackend};
use duniter_mempools::Mempools;
use fast_threadpool::{JoinHandle, ThreadPoolDisconnected};
use std::path::Path;

pub type Endpoint = String;

#[async_trait::async_trait]
pub trait DuniterModule: 'static + Sized {
    fn apply_block(
        _block: Arc<DubpBlockV10>,
        _conf: &duniter_conf::DuniterConf,
        _dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<DuniterDbs<FileBackend>>,
        _profile_path_opt: Option<&Path>,
    ) -> Result<Option<JoinHandle<KvResult<()>>>, ThreadPoolDisconnected> {
        Ok(None)
    }

    fn apply_chunk_of_blocks(
        _blocks: Arc<[DubpBlockV10]>,
        _conf: &duniter_conf::DuniterConf,
        _dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<DuniterDbs<FileBackend>>,
        _profile_path_opt: Option<&Path>,
    ) -> Result<Option<JoinHandle<KvResult<()>>>, ThreadPoolDisconnected> {
        Ok(None)
    }

    fn revert_block(
        _block: Arc<DubpBlockV10>,
        _conf: &duniter_conf::DuniterConf,
        _dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<DuniterDbs<FileBackend>>,
        _profile_path_opt: Option<&Path>,
    ) -> Result<Option<JoinHandle<KvResult<()>>>, ThreadPoolDisconnected> {
        Ok(None)
    }

    fn init(
        conf: &DuniterConf,
        currency: &str,
        dbs_pool: &fast_threadpool::ThreadPoolAsyncHandler<DuniterDbs<FileBackend>>,
        mempools: Mempools,
        profile_path_opt: Option<&Path>,
        software_version: &'static str,
    ) -> anyhow::Result<(Self, Vec<Endpoint>)>;

    async fn start(self) -> anyhow::Result<()>;
}

#[macro_export]
macro_rules! plug_duniter_modules {
    ([$($M:ty),*]) => {
        paste::paste! {
            use anyhow::Context as _;
            #[allow(dead_code)]
            fn apply_block_modules(
                block: Arc<DubpBlockV10>,
                conf: &duniter_conf::DuniterConf,
                dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<DuniterDbs<FileBackend>>,
                profile_path_opt: Option<&Path>,
            ) -> KvResult<()> {
                $(
                    let [<$M:snake>] = <$M>::apply_block(block.clone(), conf, dbs_pool, profile_path_opt).expect("thread pool disconnected");
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
                conf: &duniter_conf::DuniterConf,
                dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<DuniterDbs<FileBackend>>,
                profile_path_opt: Option<&Path>,
            ) -> KvResult<()> {
                $(
                    let [<$M:snake>] = <$M>::apply_chunk_of_blocks(blocks.clone(), conf, dbs_pool, profile_path_opt).expect("thread pool disconnected");
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
                conf: &duniter_conf::DuniterConf,
                dbs_pool: &fast_threadpool::ThreadPoolSyncHandler<DuniterDbs<FileBackend>>,
                profile_path_opt: Option<&Path>,
            ) -> KvResult<()> {
                $(
                    let [<$M:snake>] = <$M>::revert_block(block.clone(), conf, dbs_pool, profile_path_opt).expect("thread pool disconnected");
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
                dbs_pool: fast_threadpool::ThreadPoolAsyncHandler<DuniterDbs<FileBackend>>,
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

                use duniter_dbs::cm_v1::CmV1DbWritable as _;
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
            _dbs_pool: &fast_threadpool::ThreadPoolAsyncHandler<DuniterDbs<FileBackend>>,
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
            _dbs_pool: &fast_threadpool::ThreadPoolAsyncHandler<DuniterDbs<FileBackend>>,
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
        plug_duniter_modules!([TestMod1, TestMod2]);

        let dbs = DuniterDbs::mem()?;
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

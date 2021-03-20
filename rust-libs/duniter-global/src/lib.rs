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

pub use tokio;

use async_rwlock::RwLock;
use dubp::wallet::prelude::SourceAmount;
use duniter_dbs::BlockMetaV2;
use once_cell::sync::OnceCell;
use std::ops::Deref;

pub static SELF_ENDPOINTS: RwLock<Option<Vec<String>>> = RwLock::new(None);

static ASYNC_RUNTIME: OnceCell<tokio::runtime::Runtime> = OnceCell::new();
static CURRENT_META: RwLock<Option<CurrentMeta>> = RwLock::new(None);
static SELF_PEER_OLD: RwLock<Option<duniter_dbs::PeerCardDbV1>> = RwLock::new(None);

#[derive(Clone, Copy, Debug, Default)]
pub struct CurrentMeta {
    pub current_ud: SourceAmount,
    pub current_block_meta: BlockMetaV2,
}

#[derive(Clone, Debug)]
pub enum GlobalBackGroundTaskMsg {
    InitCurrentMeta(CurrentMeta),
    NewCurrentBlock(BlockMetaV2),
    GetSelfEndpoints(flume::Sender<Option<Vec<String>>>),
    SetSelfPeerOld(duniter_dbs::PeerCardDbV1),
}

pub async fn start_global_background_task(recv: flume::Receiver<GlobalBackGroundTaskMsg>) {
    tokio::spawn(async move {
        while let Ok(msg) = recv.recv_async().await {
            match msg {
                GlobalBackGroundTaskMsg::InitCurrentMeta(current_meta) => {
                    let mut write_guard = CURRENT_META.write().await;
                    write_guard.replace(current_meta);
                }
                GlobalBackGroundTaskMsg::NewCurrentBlock(current_block_meta) => {
                    let upgradable_read_guard = CURRENT_META.upgradable_read().await;
                    let new_current_meta = if let Some(dividend) = current_block_meta.dividend {
                        CurrentMeta {
                            current_ud: dividend,
                            current_block_meta,
                        }
                    } else if let Some(current_meta) = upgradable_read_guard.deref() {
                        CurrentMeta {
                            current_ud: current_meta.current_ud,
                            current_block_meta,
                        }
                    } else {
                        CurrentMeta {
                            current_ud: SourceAmount::ZERO,
                            current_block_meta,
                        }
                    };
                    let mut write_guard =
                        async_rwlock::RwLockUpgradableReadGuard::upgrade(upgradable_read_guard)
                            .await;
                    write_guard.replace(new_current_meta);
                }
                GlobalBackGroundTaskMsg::GetSelfEndpoints(sender) => {
                    let read_guard = SELF_ENDPOINTS.read().await;
                    let _ = sender.send_async(read_guard.deref().clone()).await;
                }
                GlobalBackGroundTaskMsg::SetSelfPeerOld(self_peer_old) => {
                    let mut write_guard = SELF_PEER_OLD.write().await;
                    write_guard.replace(self_peer_old);
                }
            }
        }
    });
}

pub fn get_async_runtime() -> &'static tokio::runtime::Runtime {
    ASYNC_RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("fail to build tokio runtime")
    })
}

#[derive(Clone, Copy, Debug, Default)]
pub struct AsyncAccessor;

impl AsyncAccessor {
    pub fn new() -> Self {
        AsyncAccessor
    }
    pub async fn get_current_meta<D: 'static, F: 'static + FnOnce(&CurrentMeta) -> D>(
        &self,
        f: F,
    ) -> Option<D> {
        let read_guard = CURRENT_META.read().await;
        if let Some(current_meta) = read_guard.deref() {
            Some(f(current_meta))
        } else {
            None
        }
    }
    pub async fn get_self_peer_old<
        D: 'static,
        F: 'static + FnOnce(&duniter_dbs::PeerCardDbV1) -> D,
    >(
        &self,
        f: F,
    ) -> Option<D> {
        let read_guard = SELF_PEER_OLD.read().await;
        if let Some(self_peer_old) = read_guard.deref() {
            Some(f(self_peer_old))
        } else {
            None
        }
    }
}

#[cfg(feature = "mock")]
mockall::mock! {
    pub AsyncAccessor {
        pub async fn get_current_meta<D: 'static, F: 'static + FnOnce(&CurrentMeta) -> D>(
            &self,
            f: F,
        ) -> Option<D>;
        pub async fn get_self_peer_old<
            D: 'static,
            F: 'static + FnOnce(&duniter_dbs::PeerCardDbV1) -> D,
        >(
            &self,
            f: F,
        ) -> Option<D>;
    }
}

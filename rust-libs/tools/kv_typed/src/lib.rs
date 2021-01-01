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

//! Strongly typed key-value storage

#![deny(
    clippy::unwrap_used,
    missing_copy_implementations,
    missing_debug_implementations,
    trivial_casts,
    trivial_numeric_casts,
    unstable_features,
    unused_import_braces,
    unused_qualifications
)]

mod as_bytes;
pub mod backend;
mod batch;
mod bytes;
mod collection_inner;
mod collection_ro;
mod collection_rw;
mod db_schema;
mod error;
mod event;
#[cfg(feature = "explorer")]
pub mod explorer;
mod from_bytes;
mod iter;
mod key;
mod subscription;
mod transactional_read;
mod transactional_write;
mod utils;
mod value;

// Re-export dependencies
pub use flume as channel;
#[cfg(feature = "explorer")]
pub use regex;
pub use zerocopy;

/// Kv Typed prelude
pub mod prelude {
    pub use crate::as_bytes::AsBytes;
    #[cfg(feature = "leveldb_backend")]
    pub use crate::backend::leveldb::{LevelDb, LevelDbConf};
    #[cfg(feature = "lmdb_backend")]
    pub use crate::backend::lmdb::{Lmdb, LmdbConf};
    pub use crate::backend::memory::{Mem, MemConf};
    pub use crate::backend::memory_singleton::{MemSingleton, MemSingletonConf};
    #[cfg(feature = "mock")]
    pub use crate::backend::mock::{MockBackend, MockBackendCol, MockBackendIter};
    #[cfg(feature = "sled_backend")]
    pub use crate::backend::sled::{Config as SledConf, Sled};
    pub use crate::backend::{Backend, BackendCol};
    pub use crate::batch::{Batch, BatchGet};
    #[cfg(feature = "mock")]
    pub use crate::collection_ro::MockColRo;
    pub use crate::collection_ro::{
        ColRo, DbCollectionRo, DbCollectionRoGetRef, DbCollectionRoGetRefSlice,
        DbCollectionRoIterRefSlice,
    };
    pub use crate::collection_rw::{ColRw, DbCollectionRw};
    pub use crate::error::{DynErr, KvError, KvResult};
    pub use crate::event::{EventTrait, Events};
    #[cfg(feature = "explorer")]
    pub use crate::explorer::{
        ExplorableKey, ExplorableValue, ExplorerActionErr, FromExplorerKeyErr, FromExplorerValueErr,
    };
    pub use crate::from_bytes::{FromBytes, LayoutVerifiedErr};
    pub use crate::iter::{
        keys::KvIterKeys, values::KvIterValues, EntryIter, KvIter, KvIterRefSlice, ResultIter,
    };
    pub use crate::key::{Key, KeyZc, U32BE};
    pub use crate::subscription::{NewSubscribers, Subscriber, Subscribers};
    pub use crate::transactional_read::{TransactionalRead, TxColRo};
    pub use crate::transactional_write::{DbTxCollectionRw, TransactionalWrite, TxColRw};
    pub use crate::utils::arc::Arc;
    pub use crate::value::{Value, ValueSliceZc, ValueZc};
    pub use crate::OwnedOrRef;
}

// Internal crate imports
pub(crate) use crate::backend::{BackendBatch, BackendIter};
pub(crate) use crate::bytes::{CowKB, CowVB, KeyBytes, ValueBytes};
pub(crate) use crate::collection_inner::ColInner;
pub(crate) use crate::error::BackendResult;
#[cfg(feature = "explorer")]
pub(crate) use crate::explorer::{ExplorableKey, ExplorableValue};
pub(crate) use crate::iter::{KvInnerIterRefSlice, RangeBytes, ReversableIterator};
pub(crate) use crate::prelude::*;
pub(crate) use crate::subscription::{ColSubscribers, SubscriptionsSender};
pub(crate) use crate::transactional_write::tx_iter::BackendTxIter;
pub(crate) use crate::utils::arc::Arc;
pub(crate) use crate::utils::ivec::IVec;
use flume::{unbounded, Receiver, Sender, TrySendError};
pub(crate) use smallvec::SmallVec;
pub(crate) use std::{
    collections::{BTreeSet, HashSet},
    convert::TryInto,
    error::Error,
    fmt::{Debug, Display},
    marker::PhantomData,
    ops::{Bound, RangeBounds},
    str::FromStr,
};
pub(crate) use thiserror::Error;

pub enum OwnedOrRef<'a, T> {
    Owned(T),
    Borrow(&'a T),
}
impl<'a, T> AsRef<T> for OwnedOrRef<'a, T> {
    fn as_ref(&self) -> &T {
        match self {
            Self::Owned(t) => t,
            Self::Borrow(t) => *t,
        }
    }
}
impl<'a, T: Debug> Debug for OwnedOrRef<'a, T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Owned(t) => write!(f, "OwnedOrRef::Owned({:?})", t),
            Self::Borrow(t) => write!(f, "OwnedOrRef::Borrow({:?})", t),
        }
    }
}
impl<'a, T> From<&'a T> for OwnedOrRef<'a, T> {
    fn from(borrow: &'a T) -> Self {
        Self::Borrow(borrow)
    }
}
impl<T> From<T> for OwnedOrRef<'_, T> {
    fn from(owned: T) -> Self {
        Self::Owned(owned)
    }
}

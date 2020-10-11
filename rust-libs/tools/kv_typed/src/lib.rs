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
mod collection_ro;
mod collection_rw;
mod error;
mod event;
#[cfg(feature = "explorer")]
pub mod explorer;
mod from_bytes;
mod iter;
mod key;
#[cfg(feature = "subscription")]
mod subscription;
mod utils;
mod value;

// Re-export dependencies
#[cfg(feature = "async")]
pub use async_channel as channel;
#[cfg(all(not(feature = "async"), feature = "sync"))]
pub use crossbeam_channel as channel;
#[cfg(feature = "explorer")]
pub use regex;

/// Kv Typed prelude
pub mod prelude {
    pub use crate::as_bytes::{KeyAsBytes, ValueAsBytes};
    #[cfg(feature = "leveldb_backend")]
    pub use crate::backend::leveldb::{LevelDb, LevelDbConf};
    #[cfg(feature = "memory_backend")]
    pub use crate::backend::memory::{Mem, MemConf};
    #[cfg(feature = "mock")]
    pub use crate::backend::mock::{MockBackend, MockBackendCol, MockBackendIter};
    #[cfg(feature = "sled_backend")]
    pub use crate::backend::sled::{Config as SledConf, Sled};
    pub use crate::backend::{Backend, BackendCol, TransactionalBackend};
    pub use crate::batch::Batch;
    #[cfg(feature = "mock")]
    pub use crate::collection_ro::MockColRo;
    pub use crate::collection_ro::{ColRo, DbCollectionRo};
    pub use crate::collection_rw::{ColRw, DbCollectionRw};
    pub use crate::error::{
        DynErr, KvError, KvResult, StringErr, TransactionError, TransactionResult,
    };
    pub use crate::event::{EventTrait, Events};
    #[cfg(feature = "explorer")]
    pub use crate::explorer::{ExplorableKey, ExplorableValue};
    pub use crate::from_bytes::FromBytes;
    pub use crate::iter::{
        keys::KvIterKeys, values::KvIterValues, KvIter, ResultIter, ReversableIterator,
    };
    pub use crate::key::Key;
    #[cfg(feature = "subscription")]
    pub use crate::subscription::{NewSubscribers, Subscriber, Subscribers};
    pub use crate::value::Value;
    pub use kv_typed_code_gen::db_schema;
}

// Internal crate imports
pub(crate) use crate::backend::BackendBatch;
#[cfg(feature = "explorer")]
pub(crate) use crate::explorer::{ExplorableKey, ExplorableValue};
pub(crate) use crate::iter::RangeBytes;
pub(crate) use crate::prelude::*;
#[cfg(feature = "subscription")]
pub(crate) use crate::subscription::ColSubscribers;
pub(crate) use crate::utils::arc::Arc;
pub(crate) use crate::utils::ivec::IVec;
#[cfg(feature = "async")]
use async_channel::{unbounded, Receiver, Sender, TrySendError};
#[cfg(all(not(feature = "async"), feature = "sync"))]
#[allow(unused_imports)]
use crossbeam_channel::{unbounded, Receiver, Sender, TrySendError};
pub(crate) use smallvec::SmallVec;
pub(crate) use std::{
    convert::TryInto,
    error::Error,
    fmt::Debug,
    marker::PhantomData,
    ops::{Bound, RangeBounds},
};
pub(crate) use thiserror::Error;

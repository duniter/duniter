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
pub use zerocopy;

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
    pub use crate::collection_ro::{
        ColRo, DbCollectionRo, DbCollectionRoGetRef, DbCollectionRoGetRefSlice,
    };
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
    pub use crate::value::{Value, ValueSliceZc, ValueZc};
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
    collections::{BTreeSet, HashSet},
    convert::TryInto,
    error::Error,
    fmt::Debug,
    iter::FromIterator,
    marker::PhantomData,
    ops::{Bound, RangeBounds},
};
pub(crate) use thiserror::Error;

#[macro_export]
/// $Elem must implement Display + FromStr + zerocopy::AsBytes + zerocopy::FromBytes
macro_rules! impl_value_for_vec_zc {
    ($T:ty, $Elem:ty) => {
        impl ValueAsBytes for $T {
            fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, f: F) -> KvResult<T> {
                self.0.as_bytes(f)
            }
        }
        impl FromBytes for $T {
            type Err = StringErr;

            fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
                Ok(Self(Vec::<$Elem>::from_bytes(bytes)?))
            }
        }
        impl ValueSliceZc for $T {
            type Elem = $Elem;

            fn prefix_len() -> usize {
                0
            }
        }
        #[cfg(feature = "explorer")]
        use std::str::FromStr as _;
        #[cfg(feature = "explorer")]
        impl ExplorableValue for $T {
            fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
                if let serde_json::Value::Array(json_array) =
                    serde_json::Value::from_str(source).map_err(|e| StringErr(format!("{}", e)))?
                {
                    let mut vec = Vec::with_capacity(json_array.len());
                    for value in json_array {
                        if let serde_json::Value::String(string) = value {
                            vec.push(
                                <$Elem>::from_str(&string)
                                    .map_err(|e| StringErr(format!("{}", e)))?,
                            );
                        } else {
                            return Err(StringErr(format!(
                                "Expected array of {}.",
                                stringify!($Elem)
                            )));
                        }
                    }
                    Ok(Self(vec))
                } else {
                    Err(StringErr(format!(
                        "Expected array of {}.",
                        stringify!($Elem)
                    )))
                }
            }

            fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
                Ok(serde_json::Value::Array(
                    self.0
                        .iter()
                        .map(|elem| serde_json::Value::String(format!("{}", elem)))
                        .collect(),
                ))
            }
        }
    };
}

#[macro_export]
/// $Elem must implement Display + FromStr + zerocopy::AsBytes + zerocopy::FromBytes
macro_rules! impl_value_for_smallvec_zc {
    ($T:ty, $Elem:ty, $N:literal) => {
        impl ValueAsBytes for $T {
            fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, f: F) -> KvResult<T> {
                self.0.as_bytes(f)
            }
        }
        impl FromBytes for $T {
            type Err = StringErr;

            fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
                Ok(Self(SmallVec::<[$Elem; $N]>::from_bytes(bytes)?))
            }
        }
        impl ValueSliceZc for $T {
            type Elem = $Elem;

            fn prefix_len() -> usize {
                0
            }
        }
        #[cfg(feature = "explorer")]
        use std::str::FromStr as _;
        #[cfg(feature = "explorer")]
        impl ExplorableValue for $T {
            fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
                if let serde_json::Value::Array(json_array) =
                    serde_json::Value::from_str(source).map_err(|e| StringErr(format!("{}", e)))?
                {
                    let mut svec = SmallVec::with_capacity(json_array.len());
                    for value in json_array {
                        if let serde_json::Value::String(string) = value {
                            svec.push(
                                <$Elem>::from_str(&string)
                                    .map_err(|e| StringErr(format!("{}", e)))?,
                            );
                        } else {
                            return Err(StringErr(format!(
                                "Expected array of {}.",
                                stringify!($Elem)
                            )));
                        }
                    }
                    Ok(Self(svec))
                } else {
                    Err(StringErr(format!(
                        "Expected array of {}.",
                        stringify!($Elem)
                    )))
                }
            }

            fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
                Ok(serde_json::Value::Array(
                    self.0
                        .iter()
                        .map(|elem| serde_json::Value::String(format!("{}", elem)))
                        .collect(),
                ))
            }
        }
    };
}

#[macro_export]
/// $Elem must implement Display + FromStr + Ord + zerocopy::AsBytes + zerocopy::FromBytes
macro_rules! impl_value_for_btreeset_zc {
    ($T:ty, $Elem:ty) => {
        impl ValueAsBytes for $T {
            fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, f: F) -> KvResult<T> {
                self.0.as_bytes(f)
            }
        }
        impl FromBytes for $T {
            type Err = StringErr;

            fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
                Ok(Self(BTreeSet::<$Elem>::from_bytes(bytes)?))
            }
        }
        impl ValueSliceZc for $T {
            type Elem = $Elem;

            fn prefix_len() -> usize {
                0
            }
        }
        #[cfg(feature = "explorer")]
        use std::str::FromStr as _;
        #[cfg(feature = "explorer")]
        impl ExplorableValue for $T {
            fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
                if let serde_json::Value::Array(json_array) =
                    serde_json::Value::from_str(source).map_err(|e| StringErr(format!("{}", e)))?
                {
                    let mut col = BTreeSet::new();
                    for value in json_array {
                        if let serde_json::Value::String(string) = value {
                            col.insert(
                                <$Elem>::from_str(&string)
                                    .map_err(|e| StringErr(format!("{}", e)))?,
                            );
                        } else {
                            return Err(StringErr(format!(
                                "Expected array of {}.",
                                stringify!($Elem)
                            )));
                        }
                    }
                    Ok(Self(col))
                } else {
                    Err(StringErr(format!(
                        "Expected array of {}.",
                        stringify!($Elem)
                    )))
                }
            }

            fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
                Ok(serde_json::Value::Array(
                    self.0
                        .iter()
                        .map(|elem| serde_json::Value::String(format!("{}", elem)))
                        .collect(),
                ))
            }
        }
    };
}

#[macro_export]
/// $Elem must implement Display + Eq + FromStr + std::hash::Hash + zerocopy::AsBytes + zerocopy::FromBytes
macro_rules! impl_value_for_hashset_zc {
    ($T:ty, $Elem:ty) => {
        impl ValueAsBytes for $T {
            fn as_bytes<T, F: FnMut(&[u8]) -> KvResult<T>>(&self, f: F) -> KvResult<T> {
                self.0.as_bytes(f)
            }
        }
        impl FromBytes for $T {
            type Err = StringErr;

            fn from_bytes(bytes: &[u8]) -> std::result::Result<Self, Self::Err> {
                Ok(Self(HashSet::<$Elem>::from_bytes(bytes)?))
            }
        }
        impl ValueSliceZc for $T {
            type Elem = $Elem;

            fn prefix_len() -> usize {
                0
            }
        }
        #[cfg(feature = "explorer")]
        use std::str::FromStr as _;
        #[cfg(feature = "explorer")]
        impl ExplorableValue for $T {
            fn from_explorer_str(source: &str) -> std::result::Result<Self, StringErr> {
                if let serde_json::Value::Array(json_array) =
                    serde_json::Value::from_str(source).map_err(|e| StringErr(format!("{}", e)))?
                {
                    let mut col = HashSet::new();
                    for value in json_array {
                        if let serde_json::Value::String(string) = value {
                            col.insert(
                                <$Elem>::from_str(&string)
                                    .map_err(|e| StringErr(format!("{}", e)))?,
                            );
                        } else {
                            return Err(StringErr(format!(
                                "Expected array of {}.",
                                stringify!($Elem)
                            )));
                        }
                    }
                    Ok(Self(col))
                } else {
                    Err(StringErr(format!(
                        "Expected array of {}.",
                        stringify!($Elem)
                    )))
                }
            }

            fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
                Ok(serde_json::Value::Array(
                    self.0
                        .iter()
                        .map(|elem| serde_json::Value::String(format!("{}", elem)))
                        .collect(),
                ))
            }
        }
    };
}

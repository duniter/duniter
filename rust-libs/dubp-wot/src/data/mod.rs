//  Copyright (C) 2017-2019  The AXIOM TEAM Association.
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

//! Provide data structures to manage web of trusts.
//! `LegacyWebOfTrust` is almost a translation of the legacy C++ coden while
//! `RustyWebOfTrust` is a brand new implementation with a more "rusty" style.

pub mod rusty;

use serde::de::{self, Deserialize, DeserializeOwned, Deserializer, Visitor};
use serde::{Serialize, Serializer};
use std::{
    fmt::{self, Debug},
    io::Write,
};

/// Wrapper for a node id.
#[derive(Copy, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct WotId(pub usize);

impl Serialize for WotId {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_u32(self.0 as u32)
    }
}

struct WotIdVisitor;

impl<'de> Visitor<'de> for WotIdVisitor {
    type Value = WotId;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("an integer between -2^31 and 2^31")
    }

    fn visit_u8<E>(self, value: u8) -> Result<WotId, E>
    where
        E: de::Error,
    {
        Ok(WotId(value as usize))
    }

    fn visit_u32<E>(self, value: u32) -> Result<WotId, E>
    where
        E: de::Error,
    {
        Ok(WotId(value as usize))
    }

    fn visit_u64<E>(self, value: u64) -> Result<WotId, E>
    where
        E: de::Error,
    {
        use std::usize;
        if value >= usize::MIN as u64 && value <= usize::MAX as u64 {
            Ok(WotId(value as usize))
        } else {
            Err(E::custom(format!("u32 out of range: {}", value)))
        }
    }
}

impl<'de> Deserialize<'de> for WotId {
    fn deserialize<D>(deserializer: D) -> Result<WotId, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_u32(WotIdVisitor)
    }
}

/// Results of a certification, with the current certification count
/// of the destination as parameter.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum NewLinkResult {
    /// Certification worked.
    Ok(usize),
    /// All available certifications has been used.
    AllCertificationsUsed(usize),
    /// Unknown source.
    UnknownSource(),
    /// Unknown target.
    UnknownTarget(),
    /// Self linking is forbidden.
    SelfLinkingForbidden(),
}

/// Results of a certification removal, with the current certification count
/// of the destination as parameter.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum RemLinkResult {
    /// Certification has been removed.
    Removed(usize),
    /// Requested certification doesn't exist.
    UnknownCert(usize),
    /// Unknown source.
    UnknownSource(),
    /// Unknown target.
    UnknownTarget(),
}

/// Results of a certification test.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum HasLinkResult {
    /// Both nodes are known, here is the result.
    Link(bool),
    /// Unknown source.
    UnknownSource(),
    /// Unknown target.
    UnknownTarget(),
}

/// Trait for a Web Of Trust.
/// Allow to provide other implementations of the `WoT` logic instead of the legacy C++
/// translated one.
pub trait WebOfTrust: Clone + Debug + Default + DeserializeOwned + Send + Serialize + Sync {
    /// Create a new Web of Trust with the maximum of links a node can issue.
    fn new(max_links: usize) -> Self;

    /// Clear Web of Trust datas
    fn clear(&mut self);

    /// Get the maximum number of links per user.
    fn get_max_link(&self) -> usize;

    /// Set the maximum number of links per user.
    fn set_max_link(&mut self, max_link: usize);

    /// Add a new node.
    fn add_node(&mut self) -> WotId;

    /// Remove the last node.
    /// Returns `None` if the WoT was empty, otherwise new top node id.
    fn rem_node(&mut self) -> Option<WotId>;

    /// Get the size of the WoT.
    fn size(&self) -> usize;

    /// Check if given node is enabled.
    /// Returns `None` if this node doesn't exist.
    fn is_enabled(&self, id: WotId) -> Option<bool>;

    /// Set the enabled state of given node.
    /// Returns `Null` if this node doesn't exist, `enabled` otherwise.
    fn set_enabled(&mut self, id: WotId, enabled: bool) -> Option<bool>;

    /// Get enabled node array.
    fn get_enabled(&self) -> Vec<WotId>;

    /// Get disabled node array.
    fn get_disabled(&self) -> Vec<WotId>;

    /// Try to add a link from the source to the target.
    fn add_link(&mut self, source: WotId, target: WotId) -> NewLinkResult;

    /// Try to remove a link from the source to the target.
    fn rem_link(&mut self, source: WotId, target: WotId) -> RemLinkResult;

    /// Test if there is a link from the source to the target.
    fn has_link(&self, source: WotId, target: WotId) -> HasLinkResult;

    /// Get the list of links source for this target.
    /// Returns `None` if this node doesn't exist.
    fn get_links_source(&self, target: WotId) -> Option<Vec<WotId>>;

    /// Get the number of issued links by a node.
    /// Returns `None` if this node doesn't exist.
    fn issued_count(&self, id: WotId) -> Option<usize>;

    /// Test if a node is a sentry.
    fn is_sentry(&self, node: WotId, sentry_requirement: usize) -> Option<bool>;

    /// Get sentries array.
    fn get_sentries(&self, sentry_requirement: usize) -> Vec<WotId>;

    /// Get non sentries array.
    fn get_non_sentries(&self, sentry_requirement: usize) -> Vec<WotId>;

    /// Dump wot
    fn dump<W: Write>(&self, output: &mut W) -> std::io::Result<()>;
}

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

//! Experimental implementation of the Web of Trust in a more "rusty" style.

use super::{HasLinkResult, NewLinkResult, RemLinkResult};
use crate::WebOfTrust;
use crate::WotId;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// A node in the `WoT` graph.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct Node {
    /// Is this node enabled ?
    enabled: bool,
    /// Set of links this node is the target.
    links_source: HashSet<WotId>,
    /// Number of links the node issued.
    issued_count: usize,
}

impl Node {
    /// Create a new node.
    pub fn new() -> Node {
        Node {
            enabled: true,
            links_source: HashSet::new(),
            issued_count: 0,
        }
    }
}

/// A more idiomatic implementation of a Web of Trust.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RustyWebOfTrust {
    /// List of nodes in the WoT.
    nodes: Vec<Node>,
    /// Maximum number of links a node can issue.
    max_links: usize,
}

impl Default for RustyWebOfTrust {
    fn default() -> RustyWebOfTrust {
        RustyWebOfTrust {
            nodes: Vec::new(),
            max_links: 4_000_000_000,
        }
    }
}

impl WebOfTrust for RustyWebOfTrust {
    fn new(max_links: usize) -> RustyWebOfTrust {
        RustyWebOfTrust {
            nodes: vec![],
            max_links,
        }
    }

    fn clear(&mut self) {
        self.nodes = Vec::new();
    }

    fn get_max_link(&self) -> usize {
        self.max_links
    }

    fn set_max_link(&mut self, max_links: usize) {
        self.max_links = max_links;
    }

    fn add_node(&mut self) -> WotId {
        self.nodes.push(Node::new());
        WotId(self.nodes.len() - 1)
    }

    fn rem_node(&mut self) -> Option<WotId> {
        if !self.nodes.is_empty() {
            self.nodes.pop();
            Some(WotId(self.nodes.len()))
        } else {
            None
        }
    }

    fn size(&self) -> usize {
        self.nodes.len()
    }

    fn is_enabled(&self, id: WotId) -> Option<bool> {
        self.nodes.get(id.0).map(|n| n.enabled)
    }

    fn set_enabled(&mut self, id: WotId, enabled: bool) -> Option<bool> {
        self.nodes
            .get_mut(id.0)
            .map(|n| n.enabled = enabled)
            .map(|_| enabled)
    }

    fn get_enabled(&self) -> Vec<WotId> {
        self.nodes
            .par_iter()
            .enumerate()
            .filter(|&(_, n)| n.enabled)
            .map(|(i, _)| WotId(i))
            .collect()
    }

    fn get_disabled(&self) -> Vec<WotId> {
        self.nodes
            .par_iter()
            .enumerate()
            .filter(|&(_, n)| !n.enabled)
            .map(|(i, _)| WotId(i))
            .collect()
    }

    fn add_link(&mut self, source: WotId, target: WotId) -> NewLinkResult {
        if source == target {
            NewLinkResult::SelfLinkingForbidden()
        } else if source.0 >= self.size() {
            NewLinkResult::UnknownSource()
        } else if target.0 >= self.size() {
            NewLinkResult::UnknownTarget()
        } else if self.nodes[source.0].issued_count >= self.max_links {
            NewLinkResult::AllCertificationsUsed(self.nodes[target.0].links_source.len())
        } else {
            self.nodes[source.0].issued_count += 1;
            self.nodes[target.0].links_source.insert(source);
            NewLinkResult::Ok(self.nodes[target.0].links_source.len())
        }
    }

    fn rem_link(&mut self, source: WotId, target: WotId) -> RemLinkResult {
        if source.0 >= self.size() {
            RemLinkResult::UnknownSource()
        } else if target.0 >= self.size() {
            RemLinkResult::UnknownTarget()
        } else if !self.nodes[target.0].links_source.contains(&source) {
            RemLinkResult::UnknownCert(self.nodes[target.0].links_source.len())
        } else {
            self.nodes[source.0].issued_count -= 1;
            self.nodes[target.0].links_source.remove(&source);
            RemLinkResult::Removed(self.nodes[target.0].links_source.len())
        }
    }

    fn has_link(&self, source: WotId, target: WotId) -> HasLinkResult {
        if source.0 >= self.size() {
            HasLinkResult::UnknownSource()
        } else if target.0 >= self.size() {
            HasLinkResult::UnknownTarget()
        } else {
            HasLinkResult::Link(self.nodes[target.0].links_source.contains(&source))
        }
    }

    fn get_links_source(&self, target: WotId) -> Option<Vec<WotId>> {
        self.nodes
            .get(target.0)
            .map(|n| n.links_source.iter().cloned().collect())
    }

    fn issued_count(&self, id: WotId) -> Option<usize> {
        self.nodes.get(id.0).map(|n| n.issued_count)
    }

    fn is_sentry(&self, node: WotId, sentry_requirement: usize) -> Option<bool> {
        if node.0 >= self.size() {
            return None;
        }

        let node = &self.nodes[node.0];

        Some(
            node.enabled
                && node.issued_count >= sentry_requirement
                && node.links_source.len() >= sentry_requirement,
        )
    }

    fn get_sentries(&self, sentry_requirement: usize) -> Vec<WotId> {
        self.nodes
            .par_iter()
            .enumerate()
            .filter(|&(_, n)| {
                n.enabled
                    && n.issued_count >= sentry_requirement
                    && n.links_source.len() >= sentry_requirement
            })
            .map(|(i, _)| WotId(i))
            .collect()
    }

    fn get_non_sentries(&self, sentry_requirement: usize) -> Vec<WotId> {
        self.nodes
            .par_iter()
            .enumerate()
            .filter(|&(_, n)| {
                n.enabled
                    && (n.issued_count < sentry_requirement
                        || n.links_source.len() < sentry_requirement)
            })
            .map(|(i, _)| WotId(i))
            .collect()
    }

    fn dump<W: std::io::Write>(&self, output: &mut W) -> std::io::Result<()> {
        writeln!(output, "max_links={}", self.max_links)?;
        writeln!(output, "nodes_count={}", self.nodes.len())?;
        for (node_id, node) in self.nodes.iter().enumerate() {
            write!(output, "{:03}: ", node_id)?;
            if !node.enabled {
                write!(output, "disabled ")?;
            }
            // dump sources
            write!(output, "[")?;
            let mut sorted_sources = node.links_source.iter().copied().collect::<Vec<WotId>>();
            sorted_sources.sort_unstable();
            let mut remaining_sources = sorted_sources.len();
            for source in &sorted_sources {
                if remaining_sources == 1 {
                    write!(output, "{}", source.0)?;
                } else {
                    write!(output, "{}, ", source.0)?;
                    remaining_sources -= 1;
                }
            }
            writeln!(output, "]")?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::generic_wot_test;

    #[test]
    fn wot_tests() {
        generic_wot_test::<RustyWebOfTrust>();
    }
}

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

//! Provide a trait and implementations to find paths between nodes.

use crate::data::WebOfTrust;
use crate::data::WotId;
use std::collections::HashSet;

/// Find paths between 2 nodes of a `WebOfTrust`.
pub trait PathFinder<T: WebOfTrust> {
    /// Get paths from one node to the other.
    fn find_paths(&self, wot: &T, from: WotId, to: WotId, k_max: u32) -> Vec<Vec<WotId>>;
}

/// A new "rusty-er" implementation of `WoT` path finding.
#[derive(Debug, Clone, Copy)]
pub struct RustyPathFinder;

impl<T: WebOfTrust> PathFinder<T> for RustyPathFinder {
    fn find_paths(&self, wot: &T, from: WotId, to: WotId, k_max: u32) -> Vec<Vec<WotId>> {
        if from.0 >= wot.size() || to.0 >= wot.size() {
            return vec![];
        }

        // 1. We explore the k_max area around `to`, and only remember backward
        //    links of the smallest distance.

        // Stores for each node its distance to `to` node and its backward links.
        // By default all nodes are out of range (`k_max + 1`) and links are known.
        let mut graph: Vec<(u32, Vec<WotId>)> =
            (0..wot.size()).map(|_| (k_max + 1, vec![])).collect();
        // `to` node is at distance 0, and have no backward links.
        graph[to.0] = (0, vec![]);
        // Explored zone border.
        let mut border = HashSet::new();
        border.insert(to);

        for distance in 1..=k_max {
            let mut next_border = HashSet::new();

            for node in border {
                for source in &wot
                    .get_links_source(node)
                    .expect("links source must not be None")
                {
                    match graph[source.0].0 {
                        path_distance if path_distance > distance => {
                            // shorter path, we replace
                            graph[source.0] = (distance, vec![node]);
                            next_border.insert(*source);
                        }
                        path_distance if path_distance == distance => {
                            // same length, we combine
                            graph[source.0].1.push(node);
                            next_border.insert(*source);
                        }
                        _ => unreachable!(),
                    }
                }
            }

            border = next_border;
        }

        // 2. If `from` is found, we follow the backward links and build paths.
        //    For each path, we look at the last element sources and build new paths with them.
        let mut paths = vec![vec![from]];

        for _ in 1..=k_max {
            let mut new_paths = vec![];

            for path in &paths {
                let node = path.last().expect("path should not be empty");

                if node == &to {
                    // If path is complete, we keep it.
                    new_paths.push(path.clone())
                } else {
                    // If not complete we comlete paths
                    let sources = &graph[node.0];
                    for source in &sources.1 {
                        let mut new_path = path.clone();
                        new_path.push(*source);
                        new_paths.push(new_path);
                    }
                }
            }

            paths = new_paths;
        }

        paths
    }
}

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
use std::collections::{HashMap, VecDeque};

/// Find paths between 2 nodes of a `WebOfTrust`.
pub trait CentralitiesCalculator<T: WebOfTrust> {
    /// Compute betweenness centrality of all members.
    fn betweenness_centralities(&self, wot: &T) -> Vec<u64>;
    /// Compute stress centrality of all members.
    fn stress_centralities(&self, wot: &T) -> Vec<u64>;
    /// Compute distance stress centrality of all members.
    fn distance_stress_centralities(&self, wot: &T, step_max: usize) -> Vec<u64>;
}

/// An implementation based on "Ulrik brandes" algo.
#[derive(Debug, Clone, Copy)]
pub struct UlrikBrandesCentralityCalculator;

impl<T: WebOfTrust> CentralitiesCalculator<T> for UlrikBrandesCentralityCalculator {
    fn betweenness_centralities(&self, wot: &T) -> Vec<u64> {
        let wot_size = wot.size();
        let mut centralities = vec![0.0; wot_size];
        let enabled_nodes = wot.get_enabled();

        // The source of any path belongs to enabled_nodes
        for s in enabled_nodes.clone() {
            let mut stack: Vec<WotId> = Vec::with_capacity(wot_size);
            let mut paths: HashMap<WotId, Vec<WotId>> = HashMap::with_capacity(wot_size);
            let mut sigma = vec![0.0; wot_size];
            let mut d: Vec<isize> = vec![-1; wot_size];
            let mut q: VecDeque<WotId> = VecDeque::with_capacity(wot_size);

            sigma[s.0] = 1.0;
            d[s.0] = 0;
            q.push_back(s);
            while let Some(v) = q.pop_front() {
                stack.push(v);
                for w in wot.get_links_source(v).expect("v don't have any source !") {
                    // w found for the first time ?
                    if d[w.0] < 0 {
                        q.push_back(w);
                        d[w.0] = d[v.0] + 1;
                    }
                    // Shortest path to w via v
                    if d[w.0] == d[v.0] + 1 {
                        sigma[w.0] += sigma[v.0];
                        paths.entry(w).or_insert_with(Vec::new).push(v);
                    }
                }
            }
            let mut delta = vec![0.0; wot_size];
            // stack returns vertices in order of non-increasing distance from s
            while let Some(w) = stack.pop() {
                if paths.contains_key(&w) {
                    for v in paths.get(&w).expect("Not found w in p !") {
                        if enabled_nodes.contains(&w) {
                            delta[v.0] += (sigma[v.0] / sigma[w.0]) * (1.0 + delta[w.0]);
                        } else {
                            // If w not in enabled_nodes, no path can end at w
                            delta[v.0] += (sigma[v.0] / sigma[w.0]) * delta[w.0];
                        }
                    }
                }
                if w != s {
                    centralities[w.0] += delta[w.0];
                }
            }
        }
        centralities.into_iter().map(|c| c as u64).collect()
    }
    fn stress_centralities(&self, wot: &T) -> Vec<u64> {
        let wot_size = wot.size();
        let mut centralities = vec![0.0; wot_size];
        let enabled_nodes = wot.get_enabled();

        // The source of any path belongs to enabled_nodes
        for s in enabled_nodes.clone() {
            let mut stack: Vec<WotId> = Vec::with_capacity(wot_size);
            let mut paths: HashMap<WotId, Vec<WotId>> = HashMap::with_capacity(wot_size);
            let mut sigma = vec![0.0; wot_size];
            let mut d: Vec<isize> = vec![-1; wot_size];
            let mut q: VecDeque<WotId> = VecDeque::with_capacity(wot_size);

            sigma[s.0] = 1.0;
            d[s.0] = 0;
            q.push_back(s);
            while let Some(v) = q.pop_front() {
                stack.push(v);
                for w in wot.get_links_source(v).expect("v don't have any source !") {
                    // w found for the first time ?
                    if d[w.0] < 0 {
                        q.push_back(w);
                        d[w.0] = d[v.0] + 1;
                    }
                    // Shortest path to w via v
                    if d[w.0] == d[v.0] + 1 {
                        sigma[w.0] += sigma[v.0];
                        paths.entry(w).or_insert_with(Vec::new).push(v);
                    }
                }
            }
            let mut delta = vec![0.0; wot_size];
            // stack returns vertices in order of non-increasing distance from s
            while let Some(w) = stack.pop() {
                if paths.contains_key(&w) {
                    for v in paths.get(&w).expect("Not found w in p !") {
                        if enabled_nodes.contains(&w) {
                            delta[v.0] += sigma[v.0] * (1.0 + (delta[w.0] / sigma[w.0]));
                        } else {
                            // If w not in enabled_nodes, no path can end at w
                            delta[v.0] += sigma[v.0] * (delta[w.0] / sigma[w.0]);
                        }
                    }
                }
                if w != s {
                    centralities[w.0] += delta[w.0];
                }
            }
        }
        centralities.into_iter().map(|c| c as u64).collect()
    }
    fn distance_stress_centralities(&self, wot: &T, step_max: usize) -> Vec<u64> {
        let wot_size = wot.size();
        let mut centralities = vec![0.0; wot_size];
        let enabled_nodes = wot.get_enabled();

        // The source of any path belongs to enabled_nodes
        for s in enabled_nodes.clone() {
            let mut stack: Vec<WotId> = Vec::with_capacity(wot_size);
            let mut paths: HashMap<WotId, Vec<WotId>> = HashMap::with_capacity(wot_size);
            let mut sigma = vec![0.0; wot_size];
            let mut d: Vec<isize> = vec![-1; wot_size];
            let mut q: VecDeque<WotId> = VecDeque::with_capacity(wot_size);

            sigma[s.0] = 1.0;
            d[s.0] = 0;
            q.push_back(s);
            while let Some(v) = q.pop_front() {
                stack.push(v);
                if d[v.0] < step_max as isize {
                    for w in wot.get_links_source(v).expect("v don't have any source !") {
                        // w found for the first time ?
                        if d[w.0] < 0 {
                            q.push_back(w);
                            d[w.0] = d[v.0] + 1;
                        }
                        // Shortest path to w via v
                        if d[w.0] == d[v.0] + 1 {
                            sigma[w.0] += sigma[v.0];
                            paths.entry(w).or_insert_with(Vec::new).push(v);
                        }
                    }
                }
            }
            let mut delta = vec![0.0; wot_size];
            // stack returns vertices in order of non-increasing distance from s
            while let Some(w) = stack.pop() {
                if paths.contains_key(&w) {
                    for v in paths.get(&w).expect("Not found w in p !") {
                        if enabled_nodes.contains(&w) {
                            delta[v.0] += sigma[v.0] * (1.0 + (delta[w.0] / sigma[w.0]));
                        } else {
                            // If w not in enabled_nodes, no path can end at w
                            delta[v.0] += sigma[v.0] * (delta[w.0] / sigma[w.0]);
                        }
                    }
                }
                if w != s {
                    centralities[w.0] += delta[w.0];
                }
            }
        }
        centralities.into_iter().map(|c| c as u64).collect()
    }
}

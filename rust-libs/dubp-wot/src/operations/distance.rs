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

//! Provide a trait and implementations to compute distances.

use crate::data::WebOfTrust;
use crate::data::WotId;
use rayon::prelude::*;
use std::collections::HashSet;

/// Paramters for `WoT` distance calculations
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct WotDistanceParameters {
    /// Node from where distances are calculated.
    pub node: WotId,
    /// Links count received AND issued to be a sentry.
    pub sentry_requirement: u32,
    /// Currency parameter.
    pub step_max: u32,
    /// Currency parameter.
    pub x_percent: f64,
}

/// Results of `WebOfTrust::compute_distance`.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct WotDistance {
    /// Sentries count
    pub sentries: u32,
    /// Success count
    pub success: u32,
    /// Succes at border count
    pub success_at_border: u32,
    /// Reached count
    pub reached: u32,
    /// Reached at border count
    pub reached_at_border: u32,
    /// Is the node outdistanced ?
    pub outdistanced: bool,
}

/// Compute distance between nodes of a `WebOfTrust`.
pub trait DistanceCalculator<T: WebOfTrust> {
    /// Compute distance between a node and the network.
    /// Returns `None` if this node doesn't exist.
    fn compute_distance(&self, wot: &T, params: WotDistanceParameters) -> Option<WotDistance>;

    /// Compute distances of all members
    fn compute_distances(
        &self,
        wot: &T,
        sentry_requirement: u32,
        step_max: u32,
        x_percent: f64,
    ) -> (usize, Vec<usize>, usize, Vec<usize>);

    /// Test if a node is outdistanced in the network.
    /// Returns `Node` if this node doesn't exist.
    fn is_outdistanced(&self, wot: &T, params: WotDistanceParameters) -> Option<bool>;
}

/// Calculate distances between 2 members in a `WebOfTrust`.
#[derive(Debug, Clone, Copy)]
pub struct RustyDistanceCalculator;

impl<T: WebOfTrust + Sync> DistanceCalculator<T> for RustyDistanceCalculator {
    fn compute_distance(&self, wot: &T, params: WotDistanceParameters) -> Option<WotDistance> {
        let WotDistanceParameters {
            node,
            sentry_requirement,
            step_max,
            x_percent,
        } = params;

        if node.0 >= wot.size() {
            return None;
        }

        let mut area = HashSet::new();
        area.insert(node);
        let mut border = HashSet::new();
        border.insert(node);

        for _ in 0..step_max {
            border = border
                .par_iter()
                .map(|&id| {
                    wot.get_links_source(id)
                        .expect("get_links_source must return a value")
                        .iter()
                        .filter(|source| !area.contains(source))
                        .cloned()
                        .collect::<HashSet<_>>()
                })
                .reduce(HashSet::new, |mut acc, sources| {
                    for source in sources {
                        acc.insert(source);
                    }
                    acc
                });
            area.extend(border.iter());
        }

        let sentries: Vec<_> = wot.get_sentries(sentry_requirement as usize);
        let mut success = area.iter().filter(|n| sentries.contains(n)).count() as u32;
        let success_at_border = border.iter().filter(|n| sentries.contains(n)).count() as u32;
        let mut sentries = sentries.len() as u32;
        if wot
            .is_sentry(node, sentry_requirement as usize)
            .expect("is_sentry must return a value")
        {
            sentries -= 1;
            success -= 1;
        }

        Some(WotDistance {
            sentries,
            reached: area.len() as u32 - 1,
            reached_at_border: border.len() as u32,
            success,
            success_at_border,
            outdistanced: f64::from(success) < ((x_percent * f64::from(sentries)).trunc() - 1.0),
        })
    }

    fn is_outdistanced(&self, wot: &T, params: WotDistanceParameters) -> Option<bool> {
        Self::compute_distance(&self, wot, params).map(|result| result.outdistanced)
    }

    fn compute_distances(
        &self,
        wot: &T,
        sentry_requirement: u32,
        step_max: u32,
        x_percent: f64,
    ) -> (usize, Vec<usize>, usize, Vec<usize>) {
        let members_count = wot.get_enabled().len();
        let mut distances = Vec::new();
        let mut average_distance: usize = 0;
        let mut connectivities = Vec::new();
        let mut average_connectivity: usize = 0;
        for i in 0..wot.size() {
            let distance_datas: WotDistance = Self::compute_distance(
                &self,
                wot,
                WotDistanceParameters {
                    node: WotId(i),
                    sentry_requirement,
                    step_max,
                    x_percent,
                },
            )
            .expect("Fatal Error: compute_distance return None !");
            let distance = ((f64::from(distance_datas.success)
                / (x_percent * f64::from(distance_datas.sentries)))
                * 100.0) as usize;
            distances.push(distance);
            average_distance += distance;
            let connectivity =
                ((f64::from(distance_datas.success - distance_datas.success_at_border)
                    / (x_percent * f64::from(distance_datas.sentries)))
                    * 100.0) as usize;
            connectivities.push(connectivity);
            average_connectivity += connectivity;
        }
        average_distance /= members_count;
        average_connectivity /= members_count;
        (
            average_distance,
            distances,
            average_connectivity,
            connectivities,
        )
    }
}

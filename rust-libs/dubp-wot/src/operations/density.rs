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

//! Provide function to compute average density.

use crate::data::WebOfTrust;

/// Compute average density
pub fn calculate_average_density<T: WebOfTrust>(wot: &T) -> usize {
    let enabled_members = wot.get_enabled();
    let enabled_members_count = enabled_members.len();
    let mut count_actives_links: usize = 0;
    for member in &enabled_members {
        count_actives_links += wot
            .issued_count(*member)
            .unwrap_or_else(|| panic!("Fail to get issued_count of wot_id {}", (*member).0));
    }
    ((count_actives_links as f32 / enabled_members_count as f32) * 1_000.0) as usize
}

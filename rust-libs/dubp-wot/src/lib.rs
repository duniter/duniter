//  Copyright (C) 2017-2020  The AXIOM TEAM Association.
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

//! `wot` is a crate making "Web of Trust" computations for
//! the [Duniter] project.
//!
//! [Duniter]: https://duniter.org/
//!
//! It defines a trait representing a Web of Trust and allow to do calculations on it.
//!
//! It also contains an "legacy" implementation translated from the original C++ code.
//!
//! Web of Trust tests are translated from [duniter/wot Javascript test][js-tests].
//!
//! [js-tests]: https://github.com/duniter/wot/blob/master/wotcpp/webOfTrust.cpp

#![deny(
    clippy::unwrap_used,
    missing_docs,
    missing_debug_implementations,
    missing_copy_implementations,
    trivial_casts,
    trivial_numeric_casts,
    unsafe_code,
    unstable_features,
    unused_import_braces,
    unused_qualifications
)]

pub mod data;
pub mod operations;

pub use crate::data::{WebOfTrust, WotId};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::*;
    use crate::operations::centrality::*;
    use crate::operations::distance::*;
    use crate::operations::path::*;
    use std::{io::Read, io::Write, path::Path};

    fn read_bin_file(file_path: &Path) -> Result<Vec<u8>, std::io::Error> {
        let mut file = std::fs::File::open(file_path)?;
        if file.metadata()?.len() == 0 {
            Ok(vec![])
        } else {
            let mut bin_datas = Vec::new();
            file.read_to_end(&mut bin_datas)?;

            Ok(bin_datas)
        }
    }

    fn write_bin_file(file_path: &Path, datas: &[u8]) -> Result<(), std::io::Error> {
        let mut file = std::fs::File::create(file_path)?;
        file.write_all(&datas[..])?;

        Ok(())
    }

    /// Test translated from https://github.com/duniter/wot/blob/master/tests/test.js
    ///
    /// Clone and file tests are not included in this generic test and should be done in
    /// the implementation test.
    #[allow(clippy::cognitive_complexity)]
    pub fn generic_wot_test<W>()
    where
        W: WebOfTrust + Sync,
    {
        let centralities_calculator = UlrikBrandesCentralityCalculator {};
        let distance_calculator = RustyDistanceCalculator {};
        let path_finder = RustyPathFinder {};
        let mut wot = W::new(3);

        // should have an initial size of 0
        assert_eq!(wot.size(), 0);

        // should return `None()` if testing `is_enabled()` with out-of-bounds node
        assert_eq!(wot.is_enabled(WotId(0)), None);
        assert_eq!(wot.is_enabled(WotId(23)), None);

        // should give nomber 0 if we add a node
        // - add a node
        assert_eq!(wot.add_node(), WotId(0));
        assert_eq!(wot.size(), 1);
        assert_eq!(wot.get_disabled().len(), 0);

        // delete top node (return new top node id)
        assert_eq!(wot.rem_node(), Some(WotId(0)));
        assert_eq!(wot.size(), 0);

        // readd node
        assert_eq!(wot.add_node(), WotId(0));

        // - add another
        assert_eq!(wot.add_node(), WotId(1));
        assert_eq!(wot.size(), 2);
        assert_eq!(wot.get_disabled().len(), 0);

        // - add 10 nodes
        for i in 0..10 {
            assert_eq!(wot.add_node(), WotId(i + 2));
        }

        assert_eq!(wot.size(), 12);

        // shouldn't be able to self cert
        assert_eq!(
            wot.add_link(WotId(0), WotId(0)),
            NewLinkResult::SelfLinkingForbidden()
        );

        // should add certs only in the boundaries of max_cert
        assert_eq!(wot.add_link(WotId(0), WotId(1)), NewLinkResult::Ok(1));
        assert_eq!(wot.add_link(WotId(0), WotId(2)), NewLinkResult::Ok(1));
        assert_eq!(wot.add_link(WotId(0), WotId(3)), NewLinkResult::Ok(1));
        assert_eq!(
            wot.add_link(WotId(0), WotId(4)),
            NewLinkResult::AllCertificationsUsed(0)
        );

        assert_eq!(wot.get_max_link(), 3);
        assert_eq!(wot.has_link(WotId(0), WotId(1)), HasLinkResult::Link(true));
        assert_eq!(wot.has_link(WotId(0), WotId(2)), HasLinkResult::Link(true));
        assert_eq!(wot.has_link(WotId(0), WotId(3)), HasLinkResult::Link(true));
        assert_eq!(wot.has_link(WotId(0), WotId(4)), HasLinkResult::Link(false));

        wot.set_max_link(4);
        assert_eq!(wot.get_max_link(), 4);
        assert_eq!(wot.has_link(WotId(0), WotId(4)), HasLinkResult::Link(false));
        wot.add_link(WotId(0), WotId(4));
        assert_eq!(wot.has_link(WotId(0), WotId(4)), HasLinkResult::Link(true));
        wot.rem_link(WotId(0), WotId(1));
        wot.rem_link(WotId(0), WotId(2));
        wot.rem_link(WotId(0), WotId(3));
        wot.rem_link(WotId(0), WotId(4));

        // false when not linked + test out of bounds
        assert_eq!(wot.has_link(WotId(0), WotId(6)), HasLinkResult::Link(false));
        assert_eq!(
            wot.has_link(WotId(23), WotId(0)),
            HasLinkResult::UnknownSource()
        );
        assert_eq!(
            wot.has_link(WotId(2), WotId(53)),
            HasLinkResult::UnknownTarget()
        );

        // created nodes should be enabled
        assert_eq!(wot.is_enabled(WotId(0)), Some(true));
        assert_eq!(wot.is_enabled(WotId(1)), Some(true));
        assert_eq!(wot.is_enabled(WotId(2)), Some(true));
        assert_eq!(wot.is_enabled(WotId(3)), Some(true));
        assert_eq!(wot.is_enabled(WotId(11)), Some(true));

        // should be able to disable some nodes
        assert_eq!(wot.set_enabled(WotId(0), false), Some(false));
        assert_eq!(wot.set_enabled(WotId(1), false), Some(false));
        assert_eq!(wot.set_enabled(WotId(2), false), Some(false));
        assert_eq!(wot.get_disabled().len(), 3);
        assert_eq!(wot.set_enabled(WotId(1), true), Some(true));

        // node 0 and 2 should be disabled
        assert_eq!(wot.is_enabled(WotId(0)), Some(false));
        assert_eq!(wot.is_enabled(WotId(1)), Some(true));
        assert_eq!(wot.is_enabled(WotId(2)), Some(false));
        assert_eq!(wot.is_enabled(WotId(3)), Some(true));
        // - set enabled again
        assert_eq!(wot.set_enabled(WotId(0), true), Some(true));
        assert_eq!(wot.set_enabled(WotId(1), true), Some(true));
        assert_eq!(wot.set_enabled(WotId(2), true), Some(true));
        assert_eq!(wot.set_enabled(WotId(1), true), Some(true));
        assert_eq!(wot.get_disabled().len(), 0);

        // should not exist a link from 2 to 0
        assert_eq!(wot.has_link(WotId(2), WotId(0)), HasLinkResult::Link(false));

        // should be able to add some links, cert count is returned
        assert_eq!(wot.add_link(WotId(2), WotId(0)), NewLinkResult::Ok(1));
        assert_eq!(wot.add_link(WotId(4), WotId(0)), NewLinkResult::Ok(2));
        assert_eq!(wot.add_link(WotId(5), WotId(0)), NewLinkResult::Ok(3));

        // should exist new links
        /* WoT is:
         *
         * 2 --> 0
         * 4 --> 0
         * 5 --> 0
         */

        assert_eq!(wot.has_link(WotId(2), WotId(0)), HasLinkResult::Link(true));
        assert_eq!(wot.has_link(WotId(4), WotId(0)), HasLinkResult::Link(true));
        assert_eq!(wot.has_link(WotId(5), WotId(0)), HasLinkResult::Link(true));
        assert_eq!(wot.has_link(WotId(2), WotId(1)), HasLinkResult::Link(false));

        // should be able to remove some links
        assert_eq!(wot.rem_link(WotId(4), WotId(0)), RemLinkResult::Removed(2));
        /*
         * WoT is now:
         *
         * 2 --> 0
         * 5 --> 0
         */

        // should exist less links
        assert_eq!(wot.has_link(WotId(2), WotId(0)), HasLinkResult::Link(true));
        assert_eq!(wot.has_link(WotId(4), WotId(0)), HasLinkResult::Link(false));
        assert_eq!(wot.has_link(WotId(5), WotId(0)), HasLinkResult::Link(true));
        assert_eq!(wot.has_link(WotId(2), WotId(1)), HasLinkResult::Link(false));

        // should successfully use distance rule
        assert_eq!(
            distance_calculator.is_outdistanced(
                &wot,
                WotDistanceParameters {
                    node: WotId(0),
                    sentry_requirement: 1,
                    step_max: 1,
                    x_percent: 1.0,
                },
            ),
            Some(false)
        );
        // => no because 2,4,5 have certified him
        assert_eq!(
            distance_calculator.is_outdistanced(
                &wot,
                WotDistanceParameters {
                    node: WotId(0),
                    sentry_requirement: 2,
                    step_max: 1,
                    x_percent: 1.0,
                },
            ),
            Some(false)
        );
        // => no because only member 2 has 2 certs, and has certified him
        assert_eq!(
            distance_calculator.is_outdistanced(
                &wot,
                WotDistanceParameters {
                    node: WotId(0),
                    sentry_requirement: 3,
                    step_max: 1,
                    x_percent: 1.0,
                },
            ),
            Some(false)
        );
        // => no because no member has issued 3 certifications

        // - we add links from member 3
        assert_eq!(wot.add_link(WotId(3), WotId(1)), NewLinkResult::Ok(1));
        assert_eq!(wot.add_link(WotId(3), WotId(2)), NewLinkResult::Ok(1));
        /*
         * WoT is now:
         *
         * 2 --> 0
         * 5 --> 0
         * 3 --> 1
         * 3 --> 2
         */
        assert_eq!(wot.size(), 12);
        assert_eq!(wot.get_sentries(1).len(), 1);
        assert_eq!(wot.get_sentries(1)[0], WotId(2));
        assert_eq!(wot.get_sentries(2).len(), 0);
        assert_eq!(wot.get_sentries(3).len(), 0);
        assert_eq!(wot.get_non_sentries(1).len(), 11); // 12 - 1
        assert_eq!(wot.get_non_sentries(2).len(), 12); // 12 - 0
        assert_eq!(wot.get_non_sentries(3).len(), 12); // 12 - 0
        assert_eq!(path_finder.find_paths(&wot, WotId(3), WotId(0), 1).len(), 0); // KO
        assert_eq!(path_finder.find_paths(&wot, WotId(3), WotId(0), 2).len(), 1); // It exists 3 -> 2 -> 0
        assert!(path_finder
            .find_paths(&wot, WotId(3), WotId(0), 2)
            .contains(&vec![WotId(3), WotId(2), WotId(0)]));

        assert_eq!(
            distance_calculator.is_outdistanced(
                &wot,
                WotDistanceParameters {
                    node: WotId(0),
                    sentry_requirement: 1,
                    step_max: 1,
                    x_percent: 1.0,
                },
            ),
            Some(false)
        ); // OK : 2 -> 0
        assert_eq!(
            distance_calculator.is_outdistanced(
                &wot,
                WotDistanceParameters {
                    node: WotId(0),
                    sentry_requirement: 2,
                    step_max: 1,
                    x_percent: 1.0,
                },
            ),
            Some(false)
        ); // OK : 2 -> 0
        assert_eq!(
            distance_calculator.is_outdistanced(
                &wot,
                WotDistanceParameters {
                    node: WotId(0),
                    sentry_requirement: 3,
                    step_max: 1,
                    x_percent: 1.0,
                },
            ),
            Some(false)
        ); // OK : no stry \w 3 lnk
        assert_eq!(
            distance_calculator.is_outdistanced(
                &wot,
                WotDistanceParameters {
                    node: WotId(0),
                    sentry_requirement: 2,
                    step_max: 2,
                    x_percent: 1.0,
                },
            ),
            Some(false)
        ); // OK : 2 -> 0

        wot.add_link(WotId(1), WotId(3));
        wot.add_link(WotId(2), WotId(3));

        assert_eq!(wot.size(), 12);
        assert_eq!(wot.get_sentries(1).len(), 3);
        assert_eq!(wot.get_sentries(1)[0], WotId(1));
        assert_eq!(wot.get_sentries(1)[1], WotId(2));
        assert_eq!(wot.get_sentries(1)[2], WotId(3));

        assert_eq!(wot.get_sentries(2).len(), 1);
        assert_eq!(wot.get_sentries(2)[0], WotId(3));
        assert_eq!(wot.get_sentries(3).len(), 0);
        assert_eq!(wot.get_non_sentries(1).len(), 9); // 12 - 3
        assert_eq!(wot.get_non_sentries(2).len(), 11); // 12 - 1
        assert_eq!(wot.get_non_sentries(3).len(), 12); // 12 - 0
        assert_eq!(path_finder.find_paths(&wot, WotId(3), WotId(0), 1).len(), 0); // KO
        assert_eq!(path_finder.find_paths(&wot, WotId(3), WotId(0), 2).len(), 1); // It exists 3 -> 2 -> 0
        assert!(path_finder
            .find_paths(&wot, WotId(3), WotId(0), 2)
            .contains(&vec![WotId(3), WotId(2), WotId(0)]));

        assert_eq!(
            distance_calculator.is_outdistanced(
                &wot,
                WotDistanceParameters {
                    node: WotId(0),
                    sentry_requirement: 1,
                    step_max: 1,
                    x_percent: 1.0,
                },
            ),
            Some(true)
        ); // KO : No path 3 -> 0
           /*assert_eq!(
               distance_calculator.is_outdistanced(
                   &wot,
                   WotDistanceParameters {
                       node: WotId(0),
                       sentry_requirement: 2,
                       step_max: 1,
                       x_percent: 1.0,
                   },
               ),
               Some(true)
           );*/ // KO : No path 3 -> 0
        assert_eq!(
            distance_calculator.is_outdistanced(
                &wot,
                WotDistanceParameters {
                    node: WotId(0),
                    sentry_requirement: 3,
                    step_max: 1,
                    x_percent: 1.0,
                },
            ),
            Some(false)
        ); // OK : no stry \w 3 lnk
        assert_eq!(
            distance_calculator.is_outdistanced(
                &wot,
                WotDistanceParameters {
                    node: WotId(0),
                    sentry_requirement: 2,
                    step_max: 2,
                    x_percent: 1.0,
                },
            ),
            Some(false)
        ); // OK : 3 -> 2 -> 0

        // should have 12 nodes
        assert_eq!(wot.size(), 12);

        // delete top node (return new top node id)
        assert_eq!(wot.rem_node(), Some(WotId(11)));

        // should have 11 nodes
        assert_eq!(wot.size(), 11);

        // should work with member 3 disabled
        // - with member 3 disabled (non-member)
        assert_eq!(wot.set_enabled(WotId(3), false), Some(false));
        assert_eq!(wot.get_disabled().len(), 1);
        assert_eq!(
            distance_calculator.is_outdistanced(
                &wot,
                WotDistanceParameters {
                    node: WotId(0),
                    sentry_requirement: 2,
                    step_max: 1,
                    x_percent: 1.0,
                },
            ),
            Some(false)
        ); // OK : Disabled

        // Write wot in file
        write_bin_file(
            Path::new("test.wot"),
            &bincode::serialize(&wot).expect("fail to serialize wot"),
        )
        .expect("fail to write wot file");

        let wot2_bin = read_bin_file(Path::new("test.wot")).expect("fail to read wot file");
            .expect("fail to read wot file");
        let wot2: W = bincode::deserialize(&wot2_bin).expect("fail to deserialize wot");

        // Read wot from file
        {
            assert_eq!(wot.size(), wot2.size());
            assert_eq!(
                wot.get_non_sentries(1).len(),
                wot2.get_non_sentries(1).len()
            );
            assert_eq!(wot.get_disabled().len(), wot2.get_disabled().len());
            assert_eq!(wot2.get_disabled().len(), 1);
            assert_eq!(wot2.is_enabled(WotId(3)), Some(false));
            assert_eq!(
                distance_calculator.is_outdistanced(
                    &wot2,
                    WotDistanceParameters {
                        node: WotId(0),
                        sentry_requirement: 2,
                        step_max: 1,
                        x_percent: 1.0,
                    },
                ),
                Some(false)
            );
        }

        // Dump wot
        let mut dump_wot2_chars = Vec::new();
        wot2.dump(&mut dump_wot2_chars).expect("fail to dump wot2");
        let dump_wot2_str = String::from_utf8(dump_wot2_chars).expect("invalid utf8 chars");
        assert_eq!(
            dump_wot2_str,
            "max_links=4
nodes_count=11
000: [2, 5]
001: [3]
002: [3]
003: disabled [1, 2]
004: []
005: []
006: []
007: []
008: []
009: []
010: []
"
        );

        // Read g1_genesis wot
        let wot3_bin = read_bin_file(Path::new("tests/g1_genesis.bin"))
            .expect("fail to read g1_genesis wot file");
        let wot3: W = bincode::deserialize(&wot3_bin).expect("fail to deserialize g1_genesis wot");

        // Check g1_genesis wot members_count
        let members_count = wot3.get_enabled().len() as u64;
        assert_eq!(members_count, 59);

        // Test compute_distance in g1_genesis wot
        assert_eq!(
            distance_calculator.compute_distance(
                &wot3,
                WotDistanceParameters {
                    node: WotId(37),
                    sentry_requirement: 3,
                    step_max: 5,
                    x_percent: 0.8,
                },
            ),
            Some(WotDistance {
                sentries: 48,
                success: 48,
                success_at_border: 3,
                reached: 51,
                reached_at_border: 3,
                outdistanced: false,
            },)
        );

        // Test betweenness centralities computation in g1_genesis wot
        let centralities = centralities_calculator.betweenness_centralities(&wot3);
        assert_eq!(centralities.len(), 59);
        assert_eq!(
            centralities,
            vec![
                148, 30, 184, 11, 60, 51, 40, 115, 24, 140, 47, 69, 16, 34, 94, 126, 151, 0, 34,
                133, 20, 103, 38, 144, 73, 523, 124, 23, 47, 17, 9, 64, 77, 281, 6, 105, 54, 0,
                111, 21, 6, 2, 0, 1, 47, 59, 28, 236, 0, 0, 0, 0, 60, 6, 0, 1, 8, 33, 169,
            ]
        );

        // Test stress centralities computation in g1_genesis wot
        let stress_centralities = centralities_calculator.stress_centralities(&wot3);
        assert_eq!(stress_centralities.len(), 59);
        assert_eq!(
            stress_centralities,
            vec![
                848, 240, 955, 80, 416, 203, 290, 645, 166, 908, 313, 231, 101, 202, 487, 769, 984,
                0, 154, 534, 105, 697, 260, 700, 496, 1726, 711, 160, 217, 192, 89, 430, 636, 1276,
                41, 420, 310, 0, 357, 125, 50, 15, 0, 12, 275, 170, 215, 1199, 0, 0, 0, 0, 201, 31,
                0, 9, 55, 216, 865,
            ]
        );

        // Test distance stress centralities computation in g1_genesis wot
        let distance_stress_centralities =
            centralities_calculator.distance_stress_centralities(&wot3, 5);
        assert_eq!(distance_stress_centralities.len(), 59);
        assert_eq!(
            distance_stress_centralities,
            vec![
                848, 240, 955, 80, 416, 203, 290, 645, 166, 908, 313, 231, 101, 202, 487, 769, 984,
                0, 154, 534, 105, 697, 260, 700, 496, 1726, 711, 160, 217, 192, 89, 430, 636, 1276,
                41, 420, 310, 0, 357, 125, 50, 15, 0, 12, 275, 170, 215, 1199, 0, 0, 0, 0, 201, 31,
                0, 9, 55, 216, 865,
            ]
        );
    }
}

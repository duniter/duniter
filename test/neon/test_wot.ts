"use strict";

import { Wot, WotBuilder } from "../../neon/lib";
import * as assert from "assert";
import * as path from "path";

const G1_GENESIS = path.join(__dirname, 'g1_genesis.bin.gz');
const CPP_FILE = path.join(__dirname, 'wotb.bin');
const X_PERCENT = 1.0;
const _100_PERCENT = 1.0;
const MAX_DISTANCE_1 = 1;
const MAX_DISTANCE_2 = 2;
const MAX_DISTANCE_3 = 3;
const MAX_DISTANCE_4 = 4;
const MAX_DISTANCE_5 = 5;
const FROM_1_LINK_SENTRIES = 1;
const FROM_2_LINKS_SENTRIES = 2;
const FROM_3_LINKS_SENTRIES = 3;
const __OUTDISTANCED__ = true;
const __OK__ = false;

    function newInstance(launchTest: (arg0: Wot) => any) {
        return () => {
            let wot = new Wot(3);
            launchTest(wot);
        }
    }

    describe("wotb-rs binding tests", () => {
        describe('Basic operations', newInstance((wot) => {

            it('should have 3 max links', function() {
                assert.equal(wot.getMaxCert(), 3)
            });

            it('should have an initial size of 0', function() {
              assert.equal(wot.getWoTSize(), 0);
            });

            it('should give number 0 if we add a node', function() {
                // Add a node
                assert.equal(wot.addNode(), 0);
                assert.equal(wot.getWoTSize(), 1);
                assert.equal(wot.isEnabled(0), true);
                var enabled = wot.getEnabled();
                assert.equal(enabled.length, 1);
                assert.equal(enabled[0], 0);
                assert.equal(wot.getDisabled().length, 0);
                // Add another
                assert.equal(wot.addNode(), 1);
                assert.equal(wot.getWoTSize(), 2);
                var enabled2 = wot.getEnabled();
                assert.equal(enabled2.length, 2);
                assert.equal(enabled2[1], 1);
                assert.equal(wot.getDisabled().length, 0);
                // Add 10 nodes
                for (let i = 0; i < 10; i++) {
                    assert.equal(wot.addNode(), i + 2);
                }
                assert.equal(wot.getWoTSize(), 2 + 10);
                assert.equal(wot.getEnabled().length, 2 + 10);
            });

            it('should add certs only in the boundaries of maxCert', () => {
                wot.addLink(0, 1);
                wot.addLink(0, 2);
                wot.addLink(0, 3);
                //wot.addLink(0, 4);
                assert.equal(wot.getMaxCert(), 3);
                assert.equal(wot.existsLink(0, 1), true);
                assert.equal(wot.existsLink(0, 2), true);
                assert.equal(wot.existsLink(0, 3), true);
                assert.equal(wot.existsLink(0, 4), false);
                wot.setMaxCert(4);
                assert.equal(wot.getMaxCert(), 4);
                assert.equal(wot.existsLink(0, 4), false);
                wot.addLink(0, 4);
                assert.equal(wot.existsLink(0, 4), true);
                wot.removeLink(0,1);
                wot.removeLink(0,2);
                wot.removeLink(0,3);
                wot.removeLink(0,4);
            });

            it('should not throw if testing existsLink() with inbounds link', function() {
                assert.equal(wot.existsLink(4, 6), false);
            });
        
            it('first 4 nodes should be enabled', function() {
                assert.equal(wot.isEnabled(0), true);
                assert.equal(wot.isEnabled(1), true);
                assert.equal(wot.isEnabled(2), true);
                assert.equal(wot.isEnabled(3), true);
            });

            it('last node should be enabled', function() {
                assert.equal(wot.isEnabled(11), true);
            });

            it('should be able to disable some nodes', function() {
                assert.equal(wot.setEnabled(false, 0), false);
                assert.equal(wot.setEnabled(false, 1), false);
                assert.equal(wot.setEnabled(false, 2), false);
                assert.equal(wot.getDisabled().length, 3);
                assert.equal(wot.setEnabled(true, 1), true);
            });

            it('nodes 0 and 2 should be disabled', function() {
                assert.equal(wot.isEnabled(0), false);
                assert.equal(wot.isEnabled(1), true);
                assert.equal(wot.isEnabled(2), false);
                assert.equal(wot.isEnabled(3), true);
                // Set enabled again
                assert.equal(wot.setEnabled(true, 0), true);
                assert.equal(wot.setEnabled(true, 1), true);
                assert.equal(wot.setEnabled(true, 2), true);
                assert.equal(wot.setEnabled(true, 1), true);
                assert.equal(wot.getDisabled().length, 0);
              });
        
            it('should not exist a link from 2 to 0', function() {
                assert.equal(wot.existsLink(2, 0), false);
            });
        
            it('should be able to add some links', function() {
                assert.equal(wot.addLink(2, 0), 1);
                assert.equal(wot.addLink(4, 0), 2);
                //assert.equal(wot.addLink(4, 0), 2);
                assert.equal(wot.addLink(5, 0), 3);
            });

            it('should exist new links', function() {
                /**
                 * WoT is:
                 *
                 * 2 --> 0
                 * 4 --> 0
                 * 5 --> 0
                 */
                assert.equal(wot.existsLink(2, 0), true);
                assert.equal(wot.existsLink(4, 0), true);
                assert.equal(wot.existsLink(5, 0), true);
                assert.equal(wot.existsLink(2, 1), false);
            });

            it('should be able to remove some links', function() {
                assert.equal(wot.removeLink(4, 0), 2);
                /**
                 * WoT is now:
                 *
                 * 2 --> 0
                 * 5 --> 0
                 */
            });

            it('should exist less links', function() {
                assert.equal(wot.existsLink(2, 0), true);
                assert.equal(wot.existsLink(4, 0), false);
                assert.equal(wot.existsLink(5, 0), true);
                assert.equal(wot.existsLink(2, 1), false);
            });

            it('should successfully use distance rule', function() {
                assert.equal(wot.isOutdistanced(0, FROM_1_LINK_SENTRIES, MAX_DISTANCE_1, X_PERCENT), __OK__); // No because 2,4,5 have certified him
                assert.equal(wot.isOutdistanced(0, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_1, X_PERCENT), __OK__); // No because only member 2 has 2 certs, and has certified him
                assert.equal(wot.isOutdistanced(0, FROM_3_LINKS_SENTRIES, MAX_DISTANCE_1, X_PERCENT), __OK__); // No because no member has issued 3 certifications
                // We add links from member 3
                assert.equal(wot.addLink(3, 1), 1);
                assert.equal(wot.addLink(3, 2), 1);
                /**
                 * WoT is now:
                 *
                 * 2 --> 0
                 * 5 --> 0
                 * 3 --> 1
                 * 3 --> 2
                 */
                assert.equal(wot.getWoTSize(), 12);
                assert.equal(wot.getSentries(FROM_1_LINK_SENTRIES).length, 1);
                assert.equal(wot.getSentries(FROM_1_LINK_SENTRIES)[0], 2);
                assert.equal(wot.getSentries(FROM_2_LINKS_SENTRIES).length, 0);
                assert.equal(wot.getSentries(FROM_3_LINKS_SENTRIES).length, 0);
                assert.equal(wot.getNonSentries(FROM_1_LINK_SENTRIES).length, 11); // 12 - 1 = 11
                assert.equal(wot.getNonSentries(FROM_2_LINKS_SENTRIES).length, 12); // 12 - 0 = 12
                assert.equal(wot.getNonSentries(FROM_3_LINKS_SENTRIES).length, 12); // 12 - 0 = 12
                assert.equal(wot.isOutdistanced(0, FROM_1_LINK_SENTRIES, MAX_DISTANCE_1, X_PERCENT), __OK__); // OK: 2 --> 0
                assert.equal(wot.isOutdistanced(0, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_1, X_PERCENT), __OK__); // OK: 2 --> 0
                assert.equal(wot.isOutdistanced(0, FROM_3_LINKS_SENTRIES, MAX_DISTANCE_1, X_PERCENT), __OK__); // OK: no sentry with 3 links issued
                assert.equal(wot.isOutdistanced(0, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_2, X_PERCENT), __OK__); // OK: 2 --> 0

                wot.addLink(1, 3);
                wot.addLink(2, 3);

                assert.equal(wot.getWoTSize(), 12);
                assert.equal(wot.getSentries(FROM_1_LINK_SENTRIES).length, 3);
                assert.equal(wot.getSentries(FROM_1_LINK_SENTRIES)[0], 1);
                assert.equal(wot.getSentries(FROM_1_LINK_SENTRIES)[1], 2);
                assert.equal(wot.getSentries(FROM_1_LINK_SENTRIES)[2], 3);
                assert.equal(wot.getSentries(FROM_2_LINKS_SENTRIES).length, 1);
                assert.equal(wot.getSentries(FROM_2_LINKS_SENTRIES)[0], 3);
                assert.equal(wot.getSentries(FROM_3_LINKS_SENTRIES).length, 0);
                assert.equal(wot.getNonSentries(FROM_1_LINK_SENTRIES).length, 9); // 12 - 3 = 9
                assert.equal(wot.getNonSentries(FROM_2_LINKS_SENTRIES).length, 11); // 12 - 1 = 11
                assert.equal(wot.getNonSentries(FROM_3_LINKS_SENTRIES).length, 12); // 12 - 0 = 12
                assert.equal(wot.getPaths(3, 0, MAX_DISTANCE_1).length, 0); // KO
                assert.equal(wot.getPaths(3, 0, MAX_DISTANCE_2).length, 1);    // It exists 3 --> 2 --> 0
                assert.equal(wot.getPaths(3, 0, MAX_DISTANCE_2)[0].length, 3); // It exists 3 --> 2 --> 0
                assert.equal(wot.isOutdistanced(0, FROM_1_LINK_SENTRIES, MAX_DISTANCE_1, X_PERCENT), __OUTDISTANCED__); // KO: No path 3 --> 0
                //assert.equal(wot.isOutdistanced(0, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_1, X_PERCENT), __OUTDISTANCED__); // KO: No path 3 --> 0
                assert.equal(wot.isOutdistanced(0, FROM_3_LINKS_SENTRIES, MAX_DISTANCE_1, X_PERCENT), __OK__); // OK: no sentry with 3 links issued
                assert.equal(wot.isOutdistanced(0, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_2, X_PERCENT), __OK__); // OK: 3 --> 2 --> 0
            });        

            it('should have 12 nodes', function() {
                assert.equal(wot.getWoTSize(), 12);
              });
        
              it('delete top node', function() {
                assert.equal(wot.removeNode(), 11);
              });
        
              it('should have 11 nodes', function() {
                assert.equal(wot.getWoTSize(), 11);
            });

            it('should work with member 3 disabled', function() {
                // With member 3 disabled (non-member)
                assert.equal(wot.setEnabled(false, 3), false);
                let disabled_nodes = wot.getDisabled();
                assert.equal(disabled_nodes.length, 1);
                assert.equal(disabled_nodes[0], 3);
                assert.equal(wot.isOutdistanced(0, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_1, X_PERCENT), __OK__); // OK: No path 3 --> 0, but is disabled
            });

            it('should be able to make a mem copy', function() {
                const copy = WotBuilder.fromWot(wot);
                assert.equal(copy.setEnabled(false, 3), false);
                assert.equal(wot.getDisabled().length, 1);
                assert.equal(copy.addNode(), 11);
                assert.equal(copy.getWoTSize(), 12);
                assert.equal(wot.getWoTSize(), 11);
                assert.equal(copy.isOutdistanced(0, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_1, X_PERCENT), __OK__); // OK: No path 3 --> 0, but is disabled
            });
        }));



        describe('Building a larger WoT', newInstance((wot) => {
            it('should build a larget WoT', function() {
                /* We build WoT:
                 *
                 * 0 --> 1 --> 2 --> 4 --> 5 <==> 6 --> 7
                 *             ^
                 *            ||
                 *            ##==> 3 <-- 8 <-- 9 <========##
                 *                       |                 ||
                 *                       `> 10 <==> 11 <===##
                 */
                // Add nodes
                for (let i = 0; i < 12; i++) {
                  assert.equal(wot.addNode(), i);
                }
                // First line
                assert.equal(wot.addLink(0, 1), 1);
                assert.equal(wot.addLink(1, 2), 1);
                assert.equal(wot.addLink(2, 4), 1);
                assert.equal(wot.addLink(4, 5), 1);
                assert.equal(wot.addLink(5, 6), 1);
                assert.equal(wot.addLink(6, 7), 1);
                // 2n level
                assert.equal(wot.addLink(2, 3), 1);
                assert.equal(wot.addLink(3, 2), 2);
                assert.equal(wot.addLink(8, 3), 2);
                assert.equal(wot.addLink(9, 8), 1);
                // 3rd level
                assert.equal(wot.addLink(8, 10), 1);
                assert.equal(wot.addLink(10, 11), 1);
                assert.equal(wot.addLink(11, 10), 2);
                assert.equal(wot.addLink(11, 9), 1);
                assert.equal(wot.addLink(9, 11), 2);
        
                assert.equal(wot.getWoTSize(), 12);
                return Promise.resolve();
            });

            it('should can dump wot', function() {
                assert.equal("max_links=3\nnodes_count=12\n000: []\n001: [0]\n002: [1, 3]\n003: [2, 8]\n004: [2]\n005: [4]\n006: [5]\n"
                + "007: [6]\n008: [9]\n009: [11]\n010: [8, 11]\n011: [9, 10]\n", wot.dump());
            });

            describe('testing around 2 with d = 1', () => {
      
                /**
                 * Sentries of 1 link (X are not sentries):
                 *
                 * X --> 1 --> 2 --> 4 --> 5 <==> 6 --> X
                 *             ^
                 *            ||
                 *            ##==> 3 <-- 8 <-- 9 <========##
                 *                       |                 ||
                 *                       `> 10 <==> 11 <===##
                 */
                  // => It can be seen 1..6, 8..11 = 10 sentries
                  // => MINUS the sentry #2 (which is tested and is not to be included)
                  // => 9 sentries TESTED against member#2
        
                it('should have 10 sentries', function() {
                  assert.equal(wot.getSentries(FROM_1_LINK_SENTRIES).length, 10);
                });
        
                it('distance k = 1', function() {
                  assert.equal(wot.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_1, _100_PERCENT), __OUTDISTANCED__);
                  assert.equal(wot.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_1, 0.5), __OUTDISTANCED__);
                  // 20% of the sentries: OK
                  // => 20% x 9 = 2 sentries to reach
                  // => we have 1 --> 2
                  // => we have 3 --> 2
                  // => OK (1,3)
                  assert.equal(wot.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_1, 0.2), __OK__);
                  // Who can pass 20% can pass 10%
                  assert.equal(wot.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_1, 0.1), __OK__);
                  // Can pass 23% (1,98 => 2 sentries)
                  assert.equal(wot.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_1, 0.22), __OK__);
                  // But cannot pass 23% (2,07 => 3 sentries)
                  //assert.equal(wot.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_1, 0.23), __OUTDISTANCED__);
                });
        
                it('distance k = 2', function() {
                  assert.equal(wot.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_2, _100_PERCENT), __OUTDISTANCED__);
                  //assert.equal(wot.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_2, 0.5), __OUTDISTANCED__);
                  // 33% of the sentries: OK
                  // => 33% x 9 = 3 sentries to reach
                  // With k = 2 we have the following paths:
                  // 1 --> 2
                  // 8 --> 3 --> 2
                  // => OK (1,8,3)
                  assert.equal(wot.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_2, 0.33), __OK__);
                  assert.equal(wot.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_2, 0.3), __OK__);
                  assert.equal(wot.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_2, 0.2), __OK__);
                  assert.equal(wot.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_2, 0.1), __OK__);
                  // But cannot pass 34% (3,06 => 4 sentries)
                  //assert.equal(wot.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_2, 0.34), __OUTDISTANCED__);
                });
        
                it('distance k = 5', function() {
                  assert.equal(wot.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_5, _100_PERCENT), __OUTDISTANCED__);
                  // 66% of the sentries: OK
                  // => 66% x 9 = 6 sentries to reach
                  // With k = 5 we have the following paths:
                  // 1 --> 2
                  // 10 --> 11 --> 9 --> 8 --> 3 --> 2
                  // => OK (1,10,11,9,8,3)
                  assert.equal(wot.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_5, 0.66), __OK__);
                  assert.equal(wot.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_5, 0.3), __OK__);
                  assert.equal(wot.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_5, 0.2), __OK__);
                  assert.equal(wot.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_5, 0.1), __OK__);
                  // But cannot pass 67% (6,03 => 7 sentries)
                  //assert.equal(wot.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_5, 0.67), __OUTDISTANCED__);
                  assert.deepEqual(wot.detailedDistance(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_5, 0.67), {
                    nbReached: 7, // +1 compared to reached sentries, because of member `0`
                    nbReachedAtBorder: 1,
                    nbSuccess: 6,
                    nbSuccessAtBorder: 1,
                    nbSentries: 9,
                    isOutdistanced: false
                  });
                });
              });
  
              describe('testing around 2 with d = 2', () => {
                  /**
                   * Sentries of 2 links (X are not sentries):
                   *
                   * X --> X --> 2 --> X --> X <==> X --> X
                   *             ^
                   *            ||
                   *            ##==> X <-- X <-- X <========##
                   *                       |                 ||
                   *                       `> X  <==> 11 <===##
                   */
                    // => It can be seen 2,6,8,9,11 = 5 sentries
                    // => MINUS the sentry #2 (which is tested and is not to be included)
                    // => 4 sentries
          
                  it('should have 2 sentries', function() {
                    assert.equal(wot.getSentries(FROM_2_LINKS_SENTRIES).length, 2);
                  });
          
                  it('distance k = 1', function() {
                    //assert.equal(wot.isOutdistanced(2, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_1, _100_PERCENT), __OUTDISTANCED__);
                    // With k = 1 we have no paths
                    // => ALWAYS KO
                    //assert.equal(wot.isOutdistanced(2, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_1, 0.99), __OUTDISTANCED__);
                    //assert.equal(wot.isOutdistanced(2, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_1, 0.5), __OUTDISTANCED__);
                    //assert.equal(wot.isOutdistanced(2, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_1, 0.01), __OUTDISTANCED__);
                  });
          
                  it('distance k = 2', function() {
                    // Always distanced with k = 2
                    //assert.equal(wot.isOutdistanced(2, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_2, _100_PERCENT), __OUTDISTANCED__);
                    //assert.equal(wot.isOutdistanced(2, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_2, 0.25), __OUTDISTANCED__);
                    //assert.equal(wot.isOutdistanced(2, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_2, 0.24), __OUTDISTANCED__);
                    //assert.equal(wot.isOutdistanced(2, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_2, 0.251), __OUTDISTANCED__);
                  });
          
                  it('distance k = 3', function() {
                    // Always distanced with k = 2
                    //assert.equal(wot.isOutdistanced(2, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_3, _100_PERCENT), __OUTDISTANCED__);
                    //assert.equal(wot.isOutdistanced(2, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_3, 0.50), __OUTDISTANCED__);
                    //assert.equal(wot.isOutdistanced(2, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_3, 0.49), __OUTDISTANCED__);
                    //assert.equal(wot.isOutdistanced(2, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_3, 0.51), __OUTDISTANCED__);
                  });
          
                  it('distance k = 4', function() {
                    // Only 1 sentry at distance 4: always OK
                    assert.equal(wot.isOutdistanced(2, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_4, _100_PERCENT), __OK__);
                    assert.equal(wot.isOutdistanced(2, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_4, 0.75), __OK__);
                    assert.equal(wot.isOutdistanced(2, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_4, 0.01), __OK__);
                    assert.equal(wot.isOutdistanced(2, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_4, 0.99), __OK__);
                  });
          
                  it('distance k = 5', function() {
                    // Only 1 sentry at distance 4: always OK
                    assert.equal(wot.isOutdistanced(2, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_5, _100_PERCENT), __OK__);
                    assert.equal(wot.isOutdistanced(2, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_5, 0.75), __OK__);
                    assert.equal(wot.isOutdistanced(2, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_5, 0.01), __OK__);
                    assert.equal(wot.isOutdistanced(2, FROM_2_LINKS_SENTRIES, MAX_DISTANCE_5, 0.99), __OK__);
                  });
              });
          
              describe('testing around 2 with d = 3', () => {
                  /**
                   * Sentries of 3 links (X are not sentries):
                   *
                   * X --> X --> 2 --> X --> X <==> X --> X
                   *             ^
                   *            ||
                   *            ##==> X <-- X <-- X <========##
                   *                       |                 ||
                   *                       `> X  <==> X <===##
                   */
                    // => It can be seen 2 = 1 sentries
                    // => MINUS the sentry #2 (which is tested and is not to be included)
                    // => 0 sentries
                    // => ALWAYS OK, no sentries to constraint
          
                  it('distance k = 1', function() {
                    assert.equal(wot.isOutdistanced(2, FROM_3_LINKS_SENTRIES, MAX_DISTANCE_1, _100_PERCENT), __OK__);
                    assert.equal(wot.isOutdistanced(2, FROM_3_LINKS_SENTRIES, MAX_DISTANCE_1, 0.01), __OK__);
                  });
          
                  it('distance k = 2', function() {
                    assert.equal(wot.isOutdistanced(2, FROM_3_LINKS_SENTRIES, MAX_DISTANCE_2, _100_PERCENT), __OK__);
                    assert.equal(wot.isOutdistanced(2, FROM_3_LINKS_SENTRIES, MAX_DISTANCE_2, 0.01), __OK__);
                  });
          
                  it('distance k = 5', function() {
                    assert.equal(wot.isOutdistanced(2, FROM_3_LINKS_SENTRIES, MAX_DISTANCE_5, _100_PERCENT), __OK__);
                    assert.equal(wot.isOutdistanced(2, FROM_3_LINKS_SENTRIES, MAX_DISTANCE_5, 0.01), __OK__);
                  });
              });
        }));

        describe('tests open written wot file', newInstance((wot) => {

            it('should can add 12 nodes', function() {
              for (let i = 0; i < 12; i++) {
                assert.equal(wot.addNode(), i);
              }
                assert.equal(wot.getWoTSize(), 12);
            });

            it('should add node, write and read new wot with 13 nodes', function() {
                wot.addNode();
                assert.equal(wot.getWoTSize(), 13);
                assert.equal(wot.writeInFile("test2.bin.gz"), true)
                wot.clear();
                assert.equal(wot.getWoTSize(), 0);
                let wot2 = WotBuilder.fromFile("test2.bin.gz");
                assert.equal(wot2.getWoTSize(), 13);
            });
        }));

        describe('tests g1 genesis wot', newInstance((wot) => {

            before(() => {
                wot = WotBuilder.fromFile(G1_GENESIS);
            });

            it('should have a wot size of 59', function() {
                assert.equal(wot.getWoTSize(), 59);
            });

            it('should have only enabled members', function() {
                assert.equal(wot.getEnabled().length, 59);
                assert.equal(wot.getDisabled().length, 0);
            });

            it('should have 48 sentries', function() {
                assert.equal(wot.getSentries(FROM_3_LINKS_SENTRIES).length, 48);
            });
        }));
    });

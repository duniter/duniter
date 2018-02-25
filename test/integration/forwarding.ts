import {NewLogger} from "../../app/lib/logger"
import {BmaDependency} from "../../app/modules/bma/index"
import {TestUser} from "./tools/TestUser"
import {simpleTestingConf, simpleTestingServer, TestingServer} from "./tools/toolbox"
import {RouterDependency} from "../../app/modules/router"

require('should');
const assert = require('assert');
const jspckg = require('../../package');
const constants = require('../../app/lib/constants');

BmaDependency.duniter.methods.noLimit(); // Disables the HTTP limiter

if (constants.MUTE_LOGS_DURING_UNIT_TESTS) {
  NewLogger().mute()
}

describe("Forwarding", function() {

  describe("Nodes", function() {

    const now = 1500000000
    const conf1 = simpleTestingConf(now, { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'})
    const conf2 = simpleTestingConf(now, { pub: 'G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU', sec: '58LDg8QLmF5pv6Dn9h7X4yFKfMTdP8fdAiWVcyDoTRJu454fwRihCLULH4MW37zncsg4ruoTGJPZneWk22QmG1w4'})

    const node1 = simpleTestingServer(conf1)
    const node2 = simpleTestingServer(conf2)

    const cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, node1);
    const tac = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, node1);
    const tic = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, node1);
    const toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, node1);

    before(async () => {
      await node1.initDalBmaConnections()
      await node2.initDalBmaConnections()
      await node1.sharePeeringWith(node2)
      await node2.sharePeeringWith(node1)
      RouterDependency.duniter.methods.routeToNetwork(node1._server)
      RouterDependency.duniter.methods.routeToNetwork(node2._server)
      await Promise.all([
        node2.until('identity', 4),
        node2.until('certification', 2),
        node2.until('block', 1),
        (async () => {

          // Self certifications
          await cat.createIdentity();
          await tac.createIdentity();
          await tic.createIdentity();
          await toc.createIdentity();
          // Certifications
          await cat.cert(tac);
          await tac.cert(cat);
          await cat.join();
          await tac.join();
          await node1.commit({ time: now })
        })()
      ])
      await Promise.all([
        node2.until('revocation', 1),
        cat.revoke()
      ])
    })

    describe("Testing technical API", function(){

      it('Node1 should be up and running', () => node1.expectThat('/node/summary', (summary:any) => {
        should.exists(summary);
        should.exists(summary.duniter);
        should.exists(summary.duniter.software);
        should.exists(summary.duniter.version);
        assert.equal(summary.duniter.software, "duniter");
        assert.equal(summary.duniter.version, jspckg.version);
      }))

      it('Node2 should be up and running', () => node2.expectThat('/node/summary', (summary:any) => {
        should.exists(summary);
        should.exists(summary.duniter);
        should.exists(summary.duniter.software);
        should.exists(summary.duniter.version);
        assert.equal(summary.duniter.software, "duniter");
        assert.equal(summary.duniter.version, jspckg.version);
      }))
    });

    describe('Node 1', doTests(node1));
    describe('Node 2', doTests(node2));

  });
});

function doTests(theNode:TestingServer) {

  return () => {

    describe("user cat", () => {

      it('should give only 1 result', () => theNode.expectThat('/wot/lookup/cat', (res:any) => {
        should.exists(res);
        assert.equal(res.results.length, 1);
      }));

      it('should have sent 1 signature', () => theNode.expectThat('/wot/lookup/cat', (res:any) => {
        should.exists(res);
        assert.equal(res.results[0].signed.length, 1);
        should.exists(res.results[0].signed[0].isMember);
        should.exists(res.results[0].signed[0].wasMember);
        assert.equal(res.results[0].signed[0].isMember, true);
        assert.equal(res.results[0].signed[0].wasMember, true);
      }));
    });

    describe("user tac", () => {

      it('should give only 1 result', () => theNode.expectThat('/wot/lookup/tac', (res:any) => {
        should.exists(res);
        assert.equal(res.results.length, 1);
      }))

      it('should have 1 signature', () => theNode.expectThat('/wot/lookup/tac', (res:any) => {
        should.exists(res);
        assert.equal(res.results[0].uids[0].others.length, 1);
      }))

      it('should have sent 1 signature', () => theNode.expectThat('/wot/lookup/tac', (res:any) => {
        should.exists(res);
        assert.equal(res.results[0].signed.length, 1);
      }))
    })

    it('toc should give no result', () => theNode.expectError('/wot/lookup/toc', 404, 'No matching identity'))

    it('tic should give no results', () => theNode.expectError('/wot/lookup/tic', 404, 'No matching identity'))
  }
}

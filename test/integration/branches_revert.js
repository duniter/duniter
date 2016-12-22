"use strict";

const co = require('co');
const _         = require('underscore');
const bma       = require('../../app/lib/streams/bma');
const user      = require('./tools/user');
const toolbox   = require('./tools/toolbox');
const commit    = require('./tools/commit');

const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  parcatipate: false, // TODO: to remove when startGeneration will be an explicit call
  sigQty: 1
};

const s1 = toolbox.server(_.extend({
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  },
  participate: false, rootoffset: 10,
  sigQty: 1, dt: 1, ud0: 120
}, commonConf));

const cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
const toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

describe("Revert root", function() {

  before(function() {

    return co(function *() {
      yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
      yield cat.createIdentity();
      yield toc.createIdentity();
      yield toc.cert(cat);
      yield cat.cert(toc);
      yield cat.join();
      yield toc.join();
      yield commit(s1)();
    });
  });

  it('/block/0 should exist', () => s1.expectJSON('/blockchain/block/0', {
    number: 0
  }));

  it('/wot/cat should exist', () => s1.expectThat('/wot/lookup/cat', (res) => {
    res.should.have.property('results').length(1);
    res.results[0].should.have.property('uids').length(1);
    res.results[0].uids[0].should.have.property('uid').equal('cat');
    res.results[0].uids[0].should.have.property('others').length(1);
  }));

  it('reverting should erase everything', () => co(function*() {
    yield s1.revert();
    yield s1.expectError('/blockchain/current', 404, 'No current block');
    yield s1.expectError('/blockchain/block/0', 404, 'Block not found');
    yield s1.expectError('/wot/lookup/cat', 404, 'No matching identity'); // Revert completely removes the identity
  }));
});

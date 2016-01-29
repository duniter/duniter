"use strict";

var co        = require('co');
var _         = require('underscore');
var ucoin     = require('./../../index');
var bma       = require('./../../app/lib/streams/bma');
var user      = require('./tools/user');
var commit    = require('./tools/commit');

var MEMORY_MODE = true;
var commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  parcatipate: false, // TODO: to remove when startGeneration will be an explicit call
  sigQty: 1
};

var s1 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb11'
}, _.extend({
  port: '9337',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  },
  participate: false, rootoffset: 10,
  sigQty: 1, dt: 0, ud0: 120
}, commonConf));

var s2 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb41'
}, _.extend({
  port: '9338',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  },
  participate: false, rootoffset: 10,
  sigQty: 1, dt: 0, ud0: 120,
  msValidity: 400 // Memberships expire after 400 second delay
}, commonConf));

var s3 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb11'
}, _.extend({
  port: '9339',
  pair: {
    pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
    sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'
  },
  participate: false, rootoffset: 10,
  sigQty: 1, dt: 0, ud0: 120,
  sigDelay: 0, // Links can be replayed immediately
  sigValidity: 1400
}, commonConf));

var cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
var tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });

var cat2 = user('cat2', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s2 });
var toc2 = user('toc2', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s2 });
var tic2 = user('tic2', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s2 });

var cat3 = user('cat3', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s3 });
var toc3 = user('toc3', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s3 });
var tic3 = user('tic3', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s3 });

var now = Math.round(new Date().getTime() / 1000);
const _100_PERCENT = 1.0;
const MAX_DISTANCE_1 = 1;
const MAX_DISTANCE_2 = 2;
const FROM_1_LINK_SENTRIES = 1;
const __OUTDISTANCED__ = true;
const __OK__ = false;

describe("WOTB module", function() {

  describe("Server 1", () => {

    let wotb;

    before(function() {

      return co(function *() {
        /**
         * cat <==> toc
         */
        yield s1.initWithServices().then(bma);
        wotb = s1.dal.wotb;
        yield cat.selfCertPromise();
        yield toc.selfCertPromise();
        yield toc.certPromise(cat);
        yield cat.certPromise(toc);
        yield cat.joinPromise();
        yield toc.joinPromise();
        yield commit(s1)();
      });
    });

    it('the wotb_id should be affected to new members', function() {
      return co(function *() {
        let icat = yield s1.dal.getWrittenByUID("cat");
        let itoc = yield s1.dal.getWrittenByUID("toc");
        icat.should.have.property('wotb_id').equal(0);
        itoc.should.have.property('wotb_id').equal(1);
        wotb.isEnabled(0).should.equal(true);
        wotb.isEnabled(1).should.equal(true);
        wotb.existsLink(0, 1).should.equal(true);
        wotb.existsLink(1, 0).should.equal(true);
        wotb.existsLink(1, 1).should.equal(false);
        wotb.existsLink(1, 2).should.equal(false);
        wotb.existsLink(0, 0).should.equal(false);
        wotb.existsLink(0, 2).should.equal(false);
        wotb.isOutdistanced(0, FROM_1_LINK_SENTRIES, MAX_DISTANCE_1, _100_PERCENT).should.equal(__OK__);
      });
    });

    it('a newcomer should be affected an ID + links', function() {
      return co(function *() {
        /**
         * cat <==> toc --> tic
         */
        yield tic.selfCertPromise();
        yield toc.certPromise(tic);
        yield tic.joinPromise();
        yield commit(s1)();
        let itic = yield s1.dal.getWrittenByUID("tic");
        itic.should.have.property('wotb_id').equal(2);
        wotb.isEnabled(2).should.equal(true);
        wotb.existsLink(1, 2).should.equal(true);
        wotb.existsLink(0, 2).should.equal(false);
        wotb.isOutdistanced(0, FROM_1_LINK_SENTRIES, MAX_DISTANCE_1, _100_PERCENT).should.equal(__OK__);
        wotb.isOutdistanced(1, FROM_1_LINK_SENTRIES, MAX_DISTANCE_1, _100_PERCENT).should.equal(__OK__);
        // tic is outdistanced if k = 1! (cat can't reach him)
        wotb.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_1, _100_PERCENT).should.equal(__OUTDISTANCED__);
        // but reachable if k = 2
        wotb.isOutdistanced(2, FROM_1_LINK_SENTRIES, MAX_DISTANCE_2, _100_PERCENT).should.equal(__OK__);
      });
    });
  });

  describe("Server 2", () => {

    let wotb;

    before(function() {

      return co(function *() {
        /**
         * tic <==> cat <==> toc
         */
        yield s2.initWithServices().then(bma);
        wotb = s2.dal.wotb;
        yield cat2.selfCertPromise();
        yield toc2.selfCertPromise();
        yield tic2.selfCertPromise();
        // toc2 <==> cat2
        yield toc2.certPromise(cat2);
        yield cat2.certPromise(toc2);
        // tic2 <==> cat2
        yield tic2.certPromise(cat2);
        yield cat2.certPromise(tic2);
        yield cat2.joinPromise();
        yield toc2.joinPromise();
        yield tic2.joinPromise();
        yield commit(s2)();
        // Should make MS expire for toc2
        yield commit(s2)({
          time: now + 1000
        });
        yield cat2.joinPromise(); // Renew for not to be kicked!
        yield tic2.joinPromise(); // Renew for not to be kicked!
        yield commit(s2)();
        // Members excluded
        yield commit(s2)();
      });
    });

    it('a leaver should still have links but be disabled', function() {
      return co(function *() {
        wotb.isEnabled(0).should.equal(true);
        wotb.isEnabled(1).should.equal(true);
        wotb.isEnabled(2).should.equal(false);
        // tic2 <==> cat2
        wotb.existsLink(0, 1).should.equal(true);
        wotb.existsLink(1, 0).should.equal(true);
        // toc2 <==> cat2
        wotb.existsLink(0, 2).should.equal(true);
        wotb.existsLink(2, 0).should.equal(true);
        // toc2 <==> tic2
        wotb.existsLink(1, 2).should.equal(false);
        wotb.existsLink(2, 1).should.equal(false);
      });
    });

    it('a leaver who joins back should be enabled', function() {
      return co(function *() {
        yield toc2.joinPromise();
        yield commit(s2)();
        wotb.isEnabled(0).should.equal(true);
        wotb.isEnabled(1).should.equal(true);
        wotb.isEnabled(2).should.equal(true);
        // tic2 <==> cat2
        wotb.existsLink(0, 1).should.equal(true);
        wotb.existsLink(1, 0).should.equal(true);
        // toc2 <==> cat2
        wotb.existsLink(0, 2).should.equal(true);
        wotb.existsLink(2, 0).should.equal(true);
        // toc2 <==> tic2
        wotb.existsLink(1, 2).should.equal(false);
        wotb.existsLink(2, 1).should.equal(false);
      });
    });
  });

  describe("Server 3", () => {

    let wotb;

    before(function() {

      return co(function *() {
        yield s3.initWithServices().then(bma);
        wotb = s3.dal.wotb;
        yield cat3.selfCertPromise();
        yield tic3.selfCertPromise();
        // cat <==> tic
        yield tic3.certPromise(cat3);
        yield cat3.certPromise(tic3);
        yield cat3.joinPromise();
        yield tic3.joinPromise();
      });
    });

    it('two first commits: the WoT is new and OK', function() {
      return co(function *() {
        yield commit(s3)();
        yield commit(s3)({
          time: now + 1000
        });
        /**
         * cat <==> tic
         */
        wotb.isEnabled(0).should.equal(true);
        wotb.isEnabled(1).should.equal(true);
        // cat3 <==> tic3
        wotb.existsLink(0, 1).should.equal(true);
        wotb.existsLink(1, 0).should.equal(true);
        // tic3 <==> toc3
        wotb.existsLink(1, 2).should.equal(false);
        wotb.existsLink(2, 1).should.equal(false);
      });
    });

    it('third & fourth commits: toc should have joined', function() {
      return co(function *() {
        yield commit(s3)({
          time: now + 2000
        });
        // MedianTime is now +500 for next certs
        yield toc3.selfCertPromise();
        yield toc3.joinPromise();
        yield tic3.certPromise(toc3);
        yield commit(s3)({
          time: now + 2000
        });
        // MedianTime is now +1000 for next certs
        /**
         * cat <==> tic --> toc
         */
        wotb.isEnabled(0).should.equal(true);
        wotb.isEnabled(1).should.equal(true);
        wotb.isEnabled(2).should.equal(true);
        // cat3 <==> tic3
        wotb.existsLink(0, 1).should.equal(true);
        wotb.existsLink(1, 0).should.equal(true);
        // tic3 <==> toc3
        wotb.existsLink(1, 2).should.equal(true);
        wotb.existsLink(2, 1).should.equal(false);
      });
    });

    it('fifth commit: cat still here, but not its certs', function() {
      return co(function *() {
        yield toc3.certPromise(tic3);
        yield commit(s3)({
          time: now + 2000
        });
        /**
         *   cat     tic <==> toc
         */
        wotb.isEnabled(0).should.equal(true); // But marked as to kick: cannot issue new links
        wotb.isEnabled(1).should.equal(true);
        wotb.isEnabled(2).should.equal(true);
        // cat3 <==> tic3
        wotb.existsLink(0, 1).should.equal(false);
        wotb.existsLink(1, 0).should.equal(false);
        // tic3 <==> toc3
        wotb.existsLink(1, 2).should.equal(true);
        wotb.existsLink(2, 1).should.equal(true);
      });
    });

    it('sixth commit: cat is gone with its certs', function() {
      return co(function *() {
        yield commit(s3)({
          time: now + 2500
        });
        /**
         *         tic <-- toc
         */
        wotb.isEnabled(0).should.equal(false);
        wotb.isEnabled(1).should.equal(true);
        wotb.isEnabled(2).should.equal(true);
        // cat3 <==> tic3
        wotb.existsLink(0, 1).should.equal(false);
        wotb.existsLink(1, 0).should.equal(false);
        // tic3 --> toc3
        wotb.existsLink(1, 2).should.equal(false);
        wotb.existsLink(2, 1).should.equal(true);
      });
    });

    it('seventh commit: toc is gone, but not its cert to tic', function() {
      return co(function *() {
        yield tic3.certPromise(cat3);
        yield cat3.joinPromise();
        yield commit(s3)({
          time: now + 1500
        });
        /**
         *  cat <-- tic <-- [toc]
         */
        wotb.isEnabled(0).should.equal(true);
        wotb.isEnabled(1).should.equal(true);
        wotb.isEnabled(2).should.equal(false);
        // cat3 <==> tic3
        wotb.existsLink(0, 1).should.equal(false);
        wotb.existsLink(1, 0).should.equal(true);
        // tic3 --> toc3
        wotb.existsLink(1, 2).should.equal(false);
        wotb.existsLink(2, 1).should.equal(true);
      });
    });

    it('revert seventh commit: toc is back, cat is gone', function() {
      return co(function *() {
        yield s3.revert();
        wotb.isEnabled(0).should.equal(false);
        wotb.isEnabled(1).should.equal(true);
        wotb.isEnabled(2).should.equal(true);
        // cat3 <==> tic3
        wotb.existsLink(0, 1).should.equal(false);
        wotb.existsLink(1, 0).should.equal(false);
        // tic3 --> toc3
        wotb.existsLink(1, 2).should.equal(false);
        wotb.existsLink(2, 1).should.equal(true);
      });
    });

    it('revert sixth commit: cat is back', function() {
      return co(function *() {
        yield s3.revert();
        wotb.isEnabled(0).should.equal(true); // But marked as to kick: cannot issue new links
        wotb.isEnabled(1).should.equal(true);
        wotb.isEnabled(2).should.equal(true);
        // cat3 <==> tic3
        wotb.existsLink(0, 1).should.equal(false);
        wotb.existsLink(1, 0).should.equal(false);
        // tic3 <==> toc3
        wotb.existsLink(1, 2).should.equal(true);
        wotb.existsLink(2, 1).should.equal(true);
      });
    });

    it('revert fifth commit', function() {
      return co(function *() {
        yield s3.revert();
        wotb.isEnabled(0).should.equal(true);
        wotb.isEnabled(1).should.equal(true);
        wotb.isEnabled(2).should.equal(true);
        // cat3 <==> tic3
        wotb.existsLink(0, 1).should.equal(true);
        wotb.existsLink(1, 0).should.equal(true);
        // tic3 <==> toc3
        wotb.existsLink(1, 2).should.equal(true);
        wotb.existsLink(2, 1).should.equal(false);
      });
    });

    it('revert third & fourth commits', function() {
      return co(function *() {
        yield s3.revert();
        yield s3.revert();
        wotb.isEnabled(0).should.equal(true);
        wotb.isEnabled(1).should.equal(true);
        // cat3 <==> tic3
        wotb.existsLink(0, 1).should.equal(true);
        wotb.existsLink(1, 0).should.equal(true);
        // tic3 <==> toc3
        wotb.existsLink(1, 2).should.equal(false);
        wotb.existsLink(2, 1).should.equal(false);
      });
    });

    it('revert first & second commits', function() {
      return co(function *() {
        yield s3.revert();
        yield s3.revert();
        wotb.isEnabled(0).should.equal(false);
        wotb.isEnabled(1).should.equal(false);
        wotb.isEnabled(2).should.equal(false);
        // cat3 <==> tic3
        wotb.existsLink(0, 1).should.equal(false);
        wotb.existsLink(1, 0).should.equal(false);
        // tic3 <==> toc3
        wotb.existsLink(1, 2).should.equal(false);
        wotb.existsLink(2, 1).should.equal(false);
      });
    });
  });
});

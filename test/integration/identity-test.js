"use strict";

const _         = require('underscore');
const co        = require('co');
const should    = require('should');
const duniter     = require('../../index');
const bma       = require('duniter-bma').duniter.methods.bma;
const user      = require('./tools/user');
const constants = require('../../app/lib/constants');
const rp        = require('request-promise');
const httpTest  = require('./tools/http');
const commit    = require('./tools/commit');

require('duniter-bma').duniter.methods.noLimit(); // Disables the HTTP limiter

const expectAnswer   = httpTest.expectAnswer;

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  xpercent: 0.9,
  msValidity: 10000,
  sigQty: 1
};

const s1 = duniter(
  '/bb11',
  MEMORY_MODE,
  _.extend({
  port: '7799',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
}, commonConf));

const cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
const tac = user('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
const toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
const tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
const tic2 = user('tic', { pub: '4KEA63RCFF7AXUePPg5Q7JX9RtzXjywai1iKmE7LcoEC', sec: '48vHGE2xkhnC81ChSu7dHaNv8JqnYubyyHRbkmkeAPKNg8Tv2BE7kVi3voh2ZhfVpQhEJLzceufzqpJ2dqnyXNSp'}, { server: s1 });
const man1 = user('man1', { pub: '12AbjvYY5hxV4v2KrN9pnGzgFxogwrzgYyncYHHsyFDK', sec: '2h8UNKE4YRnjmTGQTrgf4DZp2h3F5LqjnecxP8AgU6aH1x4dvbNVirsNeBiSR2UQfExuLAbdXiyM465hb5qUxYC1'}, { server: s1 });
const man2 = user('man2', { pub: 'E44RxG9jKZQsaPLFSw2ZTJgW7AVRqo1NGy6KGLbKgtNm', sec: 'pJRwpaCWshKZNWsbDxAHFQbVjk6X8gz9eBy9jaLnVY9gUZRqotrZLZPZe68ag4vEX1Y8mX77NhPXV2hj9F1UkX3'}, { server: s1 });
const man3 = user('man3', { pub: '5bfpAfZJ4xYspUBYseASJrofhRm6e6JMombt43HBaRzW', sec: '2VFQtEcYZRwjoc8Lxwfzcejtw9VP8VAi47WjwDDjCJCXu7g1tXUAbVZN3QmvG6NJqaSuLCuYP7WDHWkFmTrUEMaE'}, { server: s1 });

describe("Identities collision", function() {

  before(function() {

    const commitS1 = commit(s1);

    return co(function *() {
      yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
      yield cat.createIdentity();
      yield tac.createIdentity();
      yield toc.createIdentity();
      yield tic.createIdentity();
      yield toc.cert(cat);
      yield cat.cert(toc);
      yield cat.cert(tic);
      yield tic.cert(tac);
      yield tic.cert(cat);
      yield cat.join();
      yield toc.join();
      yield tic.join();
      yield tac.join();
      yield commitS1();
      yield commitS1();

      // We have the following WoT (diameter 3):

      /**
       *  toc <=> cat <=> tic -> tac
       */

      // cat is the sentry

      // Man1 is someone who just needs a commit to join
      yield man1.createIdentity();
      yield man1.join();
      yield tac.cert(man1);

      /**
       *  toc <=> cat -> tic -> tac -> man1
       */

      // Man2 is someone who has no certifications yet has sent a JOIN
      yield man2.createIdentity();
      yield man2.join();

      // Man3 is someone who has only published its identity
      yield man3.createIdentity();

      // tic RENEW, but not written
      yield tic.join();

      try {
        yield tic.createIdentity();
        throw 'Should have thrown an error for already used pubkey';
      } catch (e) {
        JSON.parse(e).message.should.equal('Pubkey already used in the blockchain');
      }
      try {
        yield tic2.createIdentity();
        throw 'Should have thrown an error for already used uid';
      } catch (e) {
        JSON.parse(e).message.should.equal('UID already used in the blockchain');
      }
    });
  });

  it('should have 4 members', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/wot/members', { json: true }), function(res) {
      res.should.have.property('results').length(4);
      _.pluck(res.results, 'uid').sort().should.deepEqual(['cat', 'tac', 'tic', 'toc']);
    });
  });

  it('should have identity-of/cat', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/wot/identity-of/cat', { json: true }), function(res) {
      res.should.have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.should.have.property('uid').equal('cat');
      res.should.have.property('sigDate').be.a.Number;
    });
  });

  it('should have identity-of/toc', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/wot/identity-of/toc', { json: true }), function(res) {
      res.should.have.property('pubkey').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
      res.should.have.property('uid').equal('toc');
      res.should.have.property('sigDate').be.a.Number;
    });
  });

  it('should have identity-of/tic', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/wot/identity-of/tic', { json: true }), function(res) {
      res.should.have.property('pubkey').equal('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV');
      res.should.have.property('uid').equal('tic');
      res.should.have.property('sigDate').be.a.Number;
    });
  });

  it('should have identity-of/aaa', function() {
    return httpTest.expectError(404, "No member matching this pubkey or uid", rp('http://127.0.0.1:7799/wot/identity-of/aaa'));
  });

  it('should have certifiers-of/cat giving results', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/wot/certifiers-of/cat', { json: true }), function(res) {
      res.should.have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.should.have.property('uid').equal('cat');
      res.should.have.property('isMember').equal(true);
      res.should.have.property('sigDate').be.a.Number;
      res.should.have.property('certifications').length(2);
      let certs = res.certifications;
      certs[1].should.have.property('pubkey').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
      certs[1].should.have.property('uid').equal('toc');
      certs[1].should.have.property('isMember').equal(true);
      certs[1].should.have.property('wasMember').equal(true);
      certs[1].should.have.property('sigDate').be.a.Number;
      certs[1].should.have.property('cert_time').property('block').be.a.Number;
      certs[1].should.have.property('cert_time').property('medianTime').be.a.Number;
      certs[1].should.have.property('written').property('number').equal(0);
      certs[1].should.have.property('written').property('hash').not.equal('');
      certs[1].should.have.property('signature').not.equal('');
    });
  });

  it('should have certifiers-of/tic giving results', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/wot/certifiers-of/tic', { json: true }), function(res) {
      res.should.have.property('pubkey').equal('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV');
      res.should.have.property('uid').equal('tic');
      res.should.have.property('isMember').equal(true);
      res.should.have.property('sigDate').be.a.Number;
      res.should.have.property('certifications').length(1);
      let certs = res.certifications;
      certs[0].should.have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      certs[0].should.have.property('uid').equal('cat');
      certs[0].should.have.property('isMember').equal(true);
      certs[0].should.have.property('wasMember').equal(true);
      certs[0].should.have.property('sigDate').be.a.Number;
      certs[0].should.have.property('cert_time').property('block').be.a.Number;
      certs[0].should.have.property('cert_time').property('medianTime').be.a.Number;
      certs[0].should.have.property('written').property('number').equal(0);
      certs[0].should.have.property('written').property('hash').not.equal('');
      certs[0].should.have.property('signature').not.equal('');
    });
  });

  it('should have certifiers-of/toc giving results', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/wot/certifiers-of/toc', { json: true }), function(res) {
      res.should.have.property('pubkey').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
      res.should.have.property('uid').equal('toc');
      res.should.have.property('isMember').equal(true);
      res.should.have.property('sigDate').be.a.Number;
      res.should.have.property('certifications').length(1);
      let certs = res.certifications;
      certs[0].should.have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      certs[0].should.have.property('uid').equal('cat');
      certs[0].should.have.property('isMember').equal(true);
      certs[0].should.have.property('wasMember').equal(true);
      certs[0].should.have.property('sigDate').be.a.Number;
      certs[0].should.have.property('cert_time').property('block').be.a.Number;
      certs[0].should.have.property('cert_time').property('medianTime').be.a.Number;
      certs[0].should.have.property('written').property('number').equal(0);
      certs[0].should.have.property('written').property('hash').not.equal('');
      certs[0].should.have.property('signature').not.equal('');
    });
  });

  it('requirements of cat', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/wot/requirements/cat', { json: true }), function(res) {
      res.should.have.property('identities').be.an.Array;
      res.should.have.property('identities').have.length(1);
      res.identities[0].should.have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.identities[0].should.have.property('uid').equal('cat');
      res.identities[0].should.have.property('meta').property('timestamp');
      res.identities[0].should.have.property('expired').equal(false); // Because it has been a member once! So its identity will exist forever.
      res.identities[0].should.have.property('outdistanced').equal(false);
      res.identities[0].should.have.property('isSentry').equal(true); // dSen = 2, cat has issued and received 2 certs with tic and toc
      res.identities[0].should.have.property('certifications').have.length(2);
      res.identities[0].should.have.property('membershipPendingExpiresIn').equal(0);
      res.identities[0].should.have.property('membershipExpiresIn').greaterThan(9000);
    });
  });

  it('requirements of man1', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/wot/requirements/man1', { json: true }), function(res) {
      res.should.have.property('identities').be.an.Array;
      res.should.have.property('identities').have.length(1);
      res.identities[0].should.have.property('pubkey').equal('12AbjvYY5hxV4v2KrN9pnGzgFxogwrzgYyncYHHsyFDK');
      res.identities[0].should.have.property('uid').equal('man1');
      res.identities[0].should.have.property('meta').property('timestamp');
      res.identities[0].should.have.property('expired').equal(false);
      res.identities[0].should.have.property('outdistanced').equal(false);
      res.identities[0].should.have.property('isSentry').equal(false); // Not a member, also dSen = 2, but man1 has only 1 certification
      res.identities[0].should.have.property('certifications').length(1);
      res.identities[0].certifications[0].should.have.property('from').equal('2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc');
      res.identities[0].certifications[0].should.have.property('to').equal('12AbjvYY5hxV4v2KrN9pnGzgFxogwrzgYyncYHHsyFDK');
      res.identities[0].certifications[0].should.have.property('expiresIn').greaterThan(0);
      res.identities[0].should.have.property('membershipPendingExpiresIn').greaterThan(9000);
      res.identities[0].should.have.property('membershipExpiresIn').equal(0);
    });
  });

  it('should have certified-by/tic giving results', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/wot/certified-by/tic', { json: true }), function(res) {
      res.should.have.property('pubkey').equal('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV');
      res.should.have.property('uid').equal('tic');
      res.should.have.property('isMember').equal(true);
      res.should.have.property('sigDate').be.a.Number;
      res.should.have.property('certifications').length(2);
      let certs = res.certifications;
      let found = false;
      for (const cert of certs) {
        cert.should.have.property('pubkey');
        if (cert.pubkey == '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc') {
          found = true;
          cert.should.have.property('uid').equal('tac');
          cert.should.have.property('isMember').equal(true);
          cert.should.have.property('wasMember').equal(true);
          cert.should.have.property('sigDate').be.a.Number;
          cert.should.have.property('cert_time').property('block').be.a.Number;
          cert.should.have.property('cert_time').property('medianTime').be.a.Number;
          cert.should.have.property('written').property('number').equal(0);
          cert.should.have.property('written').property('hash').not.equal('');
          cert.should.have.property('signature').not.equal('');
        }
      }
      found.should.equal(true);
    });
  });

  it('should have certified-by/tac giving results', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/wot/certified-by/tac', { json: true }), function(res) {
      res.should.have.property('pubkey').equal('2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc');
      res.should.have.property('uid').equal('tac');
      res.should.have.property('isMember').equal(true);
      res.should.have.property('sigDate').be.a.Number;
      res.should.have.property('certifications').length(0);
    });
  });

  it('should have certified-by/cat giving results', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/wot/certified-by/cat', { json: true }), function(res) {
      res.should.have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.should.have.property('uid').equal('cat');
      res.should.have.property('isMember').equal(true);
      res.should.have.property('sigDate').be.a.Number;
      res.should.have.property('certifications').length(2);
      let certs = res.certifications;
      for (const cert of certs) {
        if (cert.pubkey == 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo') {
          cert.should.have.property('uid').equal('toc');
          cert.should.have.property('isMember').equal(true);
          cert.should.have.property('wasMember').equal(true);
          cert.should.have.property('sigDate').be.a.Number;
          cert.should.have.property('cert_time').property('block').be.a.Number;
          cert.should.have.property('cert_time').property('medianTime').be.a.Number;
          cert.should.have.property('written').property('number').equal(0);
          cert.should.have.property('written').property('hash').not.equal('');
          cert.should.have.property('signature').not.equal('');
        } else {
          cert.should.have.property('pubkey').equal('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV');
          cert.should.have.property('uid').equal('tic');
          cert.should.have.property('isMember').equal(true);
          cert.should.have.property('wasMember').equal(true);
          cert.should.have.property('sigDate').be.a.Number;
          cert.should.have.property('cert_time').property('block').be.a.Number;
          cert.should.have.property('cert_time').property('medianTime').be.a.Number;
          cert.should.have.property('written').property('number').equal(0);
          cert.should.have.property('written').property('hash').not.equal('');
          cert.should.have.property('signature').not.equal('');
        }
      }
    });
  });

  it('requirements of man2', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/wot/requirements/man2', { json: true }), function(res) {
      res.should.have.property('identities').be.an.Array;
      res.should.have.property('identities').have.length(1);
      res.identities[0].should.have.property('pubkey').equal('E44RxG9jKZQsaPLFSw2ZTJgW7AVRqo1NGy6KGLbKgtNm');
      res.identities[0].should.have.property('uid').equal('man2');
      res.identities[0].should.have.property('meta').property('timestamp');
      res.identities[0].should.have.property('expired').equal(false);
      res.identities[0].should.have.property('outdistanced').equal(true);
      res.identities[0].should.have.property('isSentry').equal(false); // Outdistanced, non-member, ...
      res.identities[0].should.have.property('certifications').length(0);
      res.identities[0].should.have.property('membershipPendingExpiresIn').greaterThan(9000);
      res.identities[0].should.have.property('membershipExpiresIn').equal(0);
    });
  });

  it('requirements of man3', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/wot/requirements/man3', { json: true }), function(res) {
      res.should.have.property('identities').be.an.Array;
      res.should.have.property('identities').have.length(1);
      res.identities[0].should.have.property('pubkey').equal('5bfpAfZJ4xYspUBYseASJrofhRm6e6JMombt43HBaRzW');
      res.identities[0].should.have.property('uid').equal('man3');
      res.identities[0].should.have.property('meta').property('timestamp');
      res.identities[0].should.have.property('expired').equal(false);
      res.identities[0].should.have.property('outdistanced').equal(true);
      res.identities[0].should.have.property('isSentry').equal(false); // Outdistanced, non-member, ...
      res.identities[0].should.have.property('certifications').length(0);
      res.identities[0].should.have.property('membershipPendingExpiresIn').equal(0);
      res.identities[0].should.have.property('membershipExpiresIn').equal(0);
    });
  });

  it('requirements of man3 after revocation', () => co(function*() {
    yield man3.revoke();
    return expectAnswer(rp('http://127.0.0.1:7799/wot/requirements/man3', { json: true }), function(res) {
      res.should.have.property('identities').be.an.Array;
      res.should.have.property('identities').have.length(1);
      res.identities[0].should.have.property('pubkey').equal('5bfpAfZJ4xYspUBYseASJrofhRm6e6JMombt43HBaRzW');
      res.identities[0].should.have.property('uid').equal('man3');
      res.identities[0].should.have.property('meta').property('timestamp');
      res.identities[0].should.have.property('expired').equal(false);
      res.identities[0].should.have.property('outdistanced').equal(true);
      res.identities[0].should.have.property('isSentry').equal(false); // Outdistanced, non-member, ...
      res.identities[0].should.have.property('certifications').length(0);
      res.identities[0].should.have.property('membershipPendingExpiresIn').equal(0);
      res.identities[0].should.have.property('membershipExpiresIn').equal(0);
      res.identities[0].should.have.property('revoked').equal(false);
      res.identities[0].should.have.property('revoked_on').equal(null);
      res.identities[0].should.have.property('revocation_sig').not.equal(null);
    });
  }));

  it('memberships of tic', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/blockchain/memberships/tic', { json: true }), function(res) {
      res.should.have.property('pubkey').equal('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV');
      res.should.have.property('uid').equal('tic');
      res.should.have.property('sigDate').be.a.Number;
      res.should.have.property('memberships').length(2);
      // Renew membership, not written
      res.memberships[0].should.have.property('version').equal(constants.DOCUMENTS_VERSION);
      res.memberships[0].should.have.property('currency').equal('bb');
      res.memberships[0].should.have.property('membership').equal('IN');
      res.memberships[0].should.have.property('blockNumber').equal(1);
      res.memberships[0].should.have.property('blockHash').not.equal('E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855');
      res.memberships[0].should.have.property('written').equal(null);
    });
  });

  // it('memberships of man3', function() {
  //   return httpTest.expectHttpCode(404, rp('http://127.0.0.1:7799/blockchain/memberships/man3'));
  // });
  //
  // it('difficulties', function() {
  //   return expectAnswer(rp('http://127.0.0.1:7799/blockchain/difficulties', { json: true }), function(res) {
  //     res.should.have.property('block').equal(2);
  //     res.should.have.property('levels').length(1);
  //     res.levels[0].should.have.property('uid').equal('cat');
  //     res.levels[0].should.have.property('level').equal(4);
  //   });
  // });
});

import { NewTestingServer, TestingServer } from './tools/toolbox';
import { unlock } from '../../app/lib/common-libs/txunlock';
import { ConfDTO, CurrencyConfDTO } from '../../app/lib/dto/ConfDTO';
import { Server } from '../../server';

const co        = require('co');
const should    = require('should');
const TestUser  = require('./tools/TestUser').TestUser

let s1:any, s2:any, cat1:any, tac1:any, toc2:any, tic2:any;

describe("Document pool currency", function() {

  const now = 1500000000

  before(() => co(function*() {

    s1 = NewTestingServer({
      currency: 'currency_one',
      pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        },
        udTime0: now - 1,
        dt: 1,
        ud0: 1500
      });
      s2 = NewTestingServer({
        currency: 'currency_two',
        pair: {
          pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
          sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
        }
      });

    cat1 = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    tac1 = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
    toc2 = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s2 });
    tic2 = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s2 });

    yield s1.prepareForNetwork();
    yield s2.prepareForNetwork();

    // Publishing identities
    yield cat1.createIdentity();
    yield tac1.createIdentity();
    yield cat1.join();
    yield tac1.join();
    yield toc2.createIdentity();
    yield tic2.createIdentity();
    yield toc2.join();
    yield tic2.join();
  }));

  after(() => {
    return Promise.all([
      s1.closeCluster(),
      s2.closeCluster()
    ])
  })

  it('Identity with wrong currency should be rejected', () => co(function*() {
    const idtyCat1 = yield s1.lookup2identity(cat1.pub);
    idtyCat1.getRawSigned()
    try {
      yield s2.postIdentity(idtyCat1);
      throw "Identity should not have been accepted, since it has an unknown currency name";
    } catch (e) {
      should.exist(e.error);
      e.should.be.an.Object();
      e.error.message.should.match(/Signature does not match/);
    }
  }));

  it('Identity absorption with wrong currency should be rejected', () => co(function*() {
    try {
      const cert = yield toc2.makeCert(cat1, s1);
      yield s2.postCert(cert);
      throw "Certification should not have been accepted, since it has an unknown currency name";
    } catch (e) {
      should.exist(e.error);
      e.should.be.an.Object();
      e.error.message.should.match(/Signature does not match/);
    }
  }));

  it('Certification with wrong currency should be rejected', () => co(function*() {
    try {
      const cert = yield toc2.makeCert(tic2, null, {
        currency: "wrong_currency"
      });
      yield s2.postCert(cert);
      throw "Certification should not have been accepted, since it has an unknown currency name";
    } catch (e) {
      should.exist(e.error);
      e.should.be.an.Object();
      e.error.message.should.match(/Wrong signature for certification/);
    }
  }));

  it('Membership with wrong currency should be rejected', () => co(function*() {
    try {
      const join = yield toc2.makeMembership('IN', null, {
        currency: "wrong_currency"
      });
      yield s2.postMembership(join);
      throw "Membership should not have been accepted, since it has an unknown currency name";
    } catch (e) {
      should.exist(e.error);
      e.should.be.an.Object();
      e.error.message.should.match(/wrong signature for membership/);
    }
  }));

  it('Revocation with wrong currency should be rejected', () => co(function*() {
    try {
      const revocation = yield toc2.makeRevocation(null, {
        currency: "wrong_currency"
      });
      yield s2.postRevocation(revocation);
      throw "Revocation should not have been accepted, since it has an unknown currency name";
    } catch (e) {
      should.exist(e.error);
      e.should.be.an.Object();
      e.error.message.should.match(/Wrong signature for revocation/);
    }
  }));

  it('Block with wrong currency should be rejected', () => co(function*() {
    yield toc2.cert(tic2);
    yield tic2.cert(toc2);
    yield s2.commit();
    const b2 = yield s2.makeNext({ currency: "wrong_currency" });
    try {
      yield s2.postBlock(b2);
      throw "Currency should have been rejected";
    } catch (e) {
      should.exist(e.error);
      e.should.be.an.Object();
      e.error.message.should.match(/Wrong currency/);
    }
  }));

  it('Transaction with wrong currency should be rejected', () => co(function*() {
    try {
      yield cat1.cert(tac1);
      yield tac1.cert(cat1);
      yield s1.commit({ time: now });
      yield s1.commit({ time: now });
      const current = yield s1.get('/blockchain/current');
      const tx = cat1.makeTX(
        [{
          src: "1500:0:D:DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo:1",
          unlock: "SIG(0)"
        }],
        [{
          qty: 1500,
          base: 0,
          lock: "XHX(8AFC8DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB)"
        }],
        {
          currency: "wrong_currency",
          blockstamp: [current.number, current.hash].join('-')
        });
      yield s1.postRawTX(tx);
      throw "Transaction should not have been accepted, since it has an unknown currency name";
    } catch (e) {
      should.exist(e.error);
      e.should.be.an.Object();
      e.error.message.should.match(/Signature from a transaction must match/);
    }
  }));

  it('Transaction with wrong XHX should be rejected', () => co(function*() {
    try {
      const current = yield s1.get('/blockchain/current');
      const tx = cat1.makeTX(
        [{
          src: "1500:1:D:HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:1",
          unlock: "SIG(0)"
        }],
        [{
          qty: 1500,
          base: 1,
          lock: "XHX(6B86B273FF34FCE19D6B804EFF5A3F5747ADA4EAA22F1D49C01E52DDB7875B4B))"
        }],
        {
          blockstamp: [current.number, current.hash].join('-')
        });
      yield s1.postRawTX(tx);
      throw "Transaction should not have been accepted, since it has wrong output format";
    } catch (e) {
      should.exist(e.error);
      e.should.be.an.Object();
      e.error.message.should.match(/Wrong output format/);
    }
  }));

  it('Peer with wrong currency should be rejected', () => co(function*() {
    try {
      const peer = yield toc2.makePeer(['BASIC_MERKLED_API localhost 10901'], {
        version: 10,
        currency: "wrong_currency"
      });
      yield s2.postPeer(peer);
      throw "Peer should not have been accepted, since it has an unknown currency name";
    } catch (e) {
      should.exist(e.error);
      e.should.be.an.Object();
      e.error.message.should.match(/Signature from a peer must match/);
    }
  }));
});

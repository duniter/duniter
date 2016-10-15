"use strict";

const _         = require('underscore');
const co        = require('co');
const ucoin     = require('../../index');
const bma       = require('../../app/lib/streams/bma');
const user      = require('./tools/user');
const rp        = require('request-promise');
const httpTest  = require('./tools/http');

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb'
};

const s1 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb12'
}, _.extend({
  port: '4452',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
}, commonConf));

const cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
const tic1 = user('tic1', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
const tic2 = user('tic2', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });

describe("Lookup identity grouping", () => {

  before(() => co(function *() {
    // Server initialization
    yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());

    // cat is publishing its identity, no problem
    yield cat.createIdentity();

    // tic1 is publishing its identity
    yield tic1.createIdentity();

    // tic2 is publishing its identity, but he has **the same pubkey as tic1**.
    // This is OK on the protocol side, but the lookup should group the 2 identities
    // under the same pubkey
    yield tic2.createIdentity();

    yield cat.join();
    yield tic1.join();
  }));

  it('cat should have only 1 identity in 1 pubkey', () => httpTest.expectAnswer(rp('http://127.0.0.1:4452/wot/lookup/cat', { json: true }), (res) => {
    res.should.have.property('results').length(1);
    // cat pubkey
    res.results[0].should.have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    // only 1 UID
    res.results[0].should.have.property('uids').length(1);
    // which is cat
    res.results[0].uids[0].should.have.property('uid').equal('cat');
  }));

  it('tic should have only 2 identities in 1 pubkey', () => httpTest.expectAnswer(rp('http://127.0.0.1:4452/wot/lookup/tic', { json: true }), (res) => {
    // We want to have only 1 result for the 2 identities
    res.should.have.property('results').length(1);
    // because they share the same pubkey
    res.results[0].should.have.property('pubkey').equal('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV');
    // but got 2 UIDs
    res.results[0].should.have.property('uids').length(2);
    // which are tic1
    res.results[0].uids[0].should.have.property('uid').equal('tic1');
    // which are tic2
    res.results[0].uids[1].should.have.property('uid').equal('tic2');
  }));

  it('should exist 2 pending memberships', () => httpTest.expectAnswer(rp('http://127.0.0.1:4452/wot/pending', { json: true }), (res) => {
    res.should.have.property('memberships').length(2);
    res.memberships[0].should.have.property('pubkey').equal('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV');
    res.memberships[0].should.have.property('uid').equal('tic1');
    res.memberships[0].should.have.property('version').equal(0);
    res.memberships[0].should.have.property('currency').equal('bb');
    res.memberships[0].should.have.property('membership').equal('IN');
    res.memberships[0].should.have.property('blockNumber').equal(0);
    res.memberships[0].should.have.property('blockHash').equal('E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855');
    res.memberships[0].should.have.property('written').equal(null);
  }));
});

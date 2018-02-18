// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

"use strict";

const _         = require('underscore');
const co        = require('co');
const duniter     = require('../../index');
const bma       = require('../../app/modules/bma').BmaDependency.duniter.methods.bma;
const TestUser  = require('./tools/TestUser').TestUser
const rp        = require('request-promise');
const httpTest  = require('./tools/http');
const toolbox   = require('./tools/toolbox');
const shutDownEngine  = require('./tools/shutDownEngine');

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

let s1, s2, cat, tic

describe("Identity absorption", function() {

  before(function() {

    s1 = duniter(
      '/bb12',
      MEMORY_MODE,
      _.extend({
        port: '4450',
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        }
      }, commonConf));

    s2 = duniter(
      '/bb12',
      MEMORY_MODE,
      _.extend({
        port: '4451',
        pair: {
          pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
          sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
        }
      }, commonConf));

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    tic = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s2 });

    return co(function *() {
      yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
      yield s2.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
      yield cat.createIdentity();
      yield tic.cert(cat, s1);
    });
  });

  after(() => {
    return Promise.all([
      shutDownEngine(s1),
      shutDownEngine(s2)
    ])
  })

  it('cat should exist on server 1', function() {
    return expectAnswer(rp('http://127.0.0.1:4450/wot/lookup/cat', { json: true }), function(res) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('cat');
    });
  });

  it('cat should exist on server 2', function() {
    return expectAnswer(rp('http://127.0.0.1:4451/wot/lookup/cat', { json: true }), function(res) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('cat');
    });
  });

  it('should test idty absorption refusal', () => co(function*() {
    (yield s2.dal.idtyDAL.query('SELECT * FROM idty')).should.have.length(1);
    yield s2.dal.idtyDAL.exec('DELETE FROM idty');
    (yield s2.dal.idtyDAL.query('SELECT * FROM idty')).should.have.length(0);
    yield toolbox.shouldFail(tic.cert(cat, s1), 'Already up-to-date');
    (yield s2.dal.idtyDAL.query('SELECT * FROM idty')).should.have.length(1);
    (yield s2.dal.idtyDAL.query('SELECT * FROM idty WHERE removed')).should.have.length(1);
    (yield s2.dal.idtyDAL.query('SELECT * FROM idty WHERE NOT removed')).should.have.length(0);
  }));
});

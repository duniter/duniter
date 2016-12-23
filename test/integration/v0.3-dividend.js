"use strict";

const co        = require('co');
const should    = require('should');
const bma       = require('../../app/lib/streams/bma');
const user      = require('./tools/user');
const commit    = require('./tools/commit');
const until     = require('./tools/until');
const toolbox   = require('./tools/toolbox');
const multicaster = require('../../app/lib/streams/multicaster');

const s1 = toolbox.server({
  c: 0.1,
  dt: 10,
  ud0: 100,
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
});

const cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
const tac = user('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
const tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });

let now;

describe("Protocol 0.3 Dividend", function() {

  before(() => co(function*() {

    now = Math.round(new Date().getTime() / 1000);

    yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());

    yield cat.createIdentity();
    yield tac.createIdentity();
    yield cat.cert(tac);
    yield tac.cert(cat);
    yield cat.join();
    yield tac.join();
    yield s1.commit({ version: 3, time: now });
    yield s1.commit({ version: 3, time: now + 5000 });
    yield s1.commit({ version: 3, time: now + 5000 });
    yield s1.commit({ version: 3, time: now + 5000 });

    // tic joins
    yield tic.createIdentity();
    yield cat.cert(tic);
    yield tic.join();
    yield s1.commit({ version: 3, time: now + 5000 });
    yield s1.commit({ version: 3, time: now + 5000 });
  }));

  it('should exit 2 dividends for cat', () => s1.expect('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (res) => {
    res.should.have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    res.should.have.property('sources').length(4);
    res.sources[0].should.have.property('amount').equal(110);
    res.sources[1].should.have.property('amount').equal(121);
    res.sources[2].should.have.property('amount').equal(133);
    res.sources[3].should.have.property('amount').equal(146);
    res.sources[0].should.have.property('base').equal(0);
    res.sources[1].should.have.property('base').equal(0);
  }));

  it('should be able to send 300 units', () => co(function *() {
    yield cat.send(300, tac);
    yield s1.commit({ version: 3 });
    yield s1.expect('/tx/sources/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', (res) => {
      res.should.have.property('pubkey').equal('2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc');
      res.should.have.property('sources').length(6);
      res.sources[0].should.have.property('amount').equal(110);
      res.sources[1].should.have.property('amount').equal(121);
      res.sources[2].should.have.property('amount').equal(133);
      res.sources[3].should.have.property('amount').equal(146);
      res.sources[4].should.have.property('amount').equal(161);
      res.sources[5].should.have.property('amount').equal(300);
      res.sources[0].should.have.property('type').equal('D');
      res.sources[1].should.have.property('type').equal('D');
      res.sources[2].should.have.property('type').equal('D');
      res.sources[3].should.have.property('type').equal('D');
      res.sources[4].should.have.property('type').equal('D');
      res.sources[5].should.have.property('type').equal('T');
    })
  }));

  it('should have a correct history', () => s1.expect('/tx/history/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', (res) => {
    res.history.received[0].should.have.property('blockstamp').not.equal(null).not.equal('');
    res.history.received[0].should.have.property('blockstampTime').not.equal(null).greaterThan(0);
  }));
});

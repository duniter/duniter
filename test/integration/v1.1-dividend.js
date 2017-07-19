"use strict";

const co        = require('co');
const should    = require('should');
const bma       = require('duniter-bma').duniter.methods.bma;
const user      = require('./tools/user');
const commit    = require('./tools/commit');
const toolbox   = require('./tools/toolbox');

const now = 1484000000;

const s1 = toolbox.server({
  c: 0.1,
  dt: 10,
  dtReeval: 10,
  udTime0: now + 10,
  udReevalTime0: now + 10,
  ud0: 100,
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  },
  medianTimeBlocks: 1
});

const cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
const tac = user('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
const tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });


describe("Protocol 1.1 Dividend", function() {

  before(() => co(function*() {

    yield s1.initDalBmaConnections();

    yield cat.createIdentity();
    yield tac.createIdentity();
    yield cat.cert(tac);
    yield tac.cert(cat);
    yield cat.join();
    yield tac.join();
    yield s1.commit({ time: now });
    yield s1.commit({ time: now + 10 });
    yield s1.commit({ time: now + 10 * 2 });
    yield s1.commit({ time: now + 10 * 3 });

    // tic joins
    yield tic.createIdentity();
    yield cat.cert(tic);
    yield tic.join();
    yield s1.commit({ time: now + 10 + 10 * 4 });
    yield s1.commit({ time: now + 10 + 10 * 5 });
  }));

  it('should exit 2 dividends for cat', () => s1.expect('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (res) => {
    res.should.have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    res.should.have.property('sources').length(4);
    res.sources[0].should.have.property('amount').equal(100); // UD(0) = ud0 => M(0) = 0
    res.sources[1].should.have.property('amount').equal(100); // t = 1, M(t-1) = 0; , N(t) = 2, UD(t) = UD(t-1) + c²*M(t-1)/N(t) = 100 + 0.01*0/2 = 100 (ceiled) => M(1) = 200
    res.sources[2].should.have.property('amount').equal(101); // t = 2, M(t-1) = 200, N(t) = 3, UD(t) = UD(t-1) + c²*M(t-1)/N(t) = 100 + 0.01*200/3 = 101 (ceiled) => M(2) = M(1)+N(t-1)*DU(t-1) = 200+2*100 = 400
    res.sources[3].should.have.property('amount').equal(103); // t = 3, M(t-1) = 402, N(t) = 3, UD(t) = UD(t-1) + c²*M(t-1)/N(t) = 101 + 0.01*400/3 = 103 (ceiled) => M(3) = M(2)+N(t-1)*DU(t-1) = 400+3*101 = 703
    res.sources[0].should.have.property('base').equal(0);
    res.sources[1].should.have.property('base').equal(0);
  }));

  it('should be able to send 300 units', () => co(function *() {
    yield cat.send(105, tac);
    yield s1.commit();
    yield s1.expect('/tx/sources/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', (res) => {
      res.should.have.property('pubkey').equal('2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc');
      res.should.have.property('sources').length(6);
      res.sources[0].should.have.property('amount').equal(100);
      res.sources[1].should.have.property('amount').equal(100);
      res.sources[2].should.have.property('amount').equal(101);
      res.sources[3].should.have.property('amount').equal(103);
      res.sources[4].should.have.property('amount').equal(106);
      res.sources[5].should.have.property('amount').equal(105);
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

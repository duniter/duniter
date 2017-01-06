"use strict";

const co = require('co');
const should = require('should');
const engine = require('../../../app/lib/pow/engine');

describe('PoW Engine', () => {

  it('should start with status "ready", then "idle"', () => co(function*(){
    const e1 = engine();
    (yield e1.status()).should.equal('ready');
    (yield e1.status()).should.equal('ready');
    yield e1.setValue('autokillTimeout', 10);
  }));

  it('should automatically close itself if no signal is sent', () => co(function*(){
    const e1 = engine();
    (yield e1.status()).should.equal('ready');
    (yield e1.status()).should.equal('ready');
    yield e1.setValue('autokillTimeout', 50);
    (yield e1.status()).should.equal('ready');
    (yield e1.status()).should.equal('ready');
    yield new Promise((res) => setTimeout(res, 100));
    e1.isConnected().should.equal(false);
  }));

  it('should NOT automatically close itself too early', () => co(function*(){
    const e1 = engine();
    e1.isConnected().should.equal(false);
    (yield e1.status()).should.equal('ready');
    e1.isConnected().should.equal(true);
    (yield e1.status()).should.equal('ready');
    yield e1.setValue('autokillTimeout', 200);
    yield new Promise((res) => setTimeout(res, 100));
    e1.isConnected().should.equal(true);
    yield new Promise((res) => setTimeout(res, 50));
    e1.isConnected().should.equal(true);
    yield new Promise((res) => setTimeout(res, 30));
    e1.isConnected().should.equal(true);
    yield new Promise((res) => setTimeout(res, 30));
    e1.isConnected().should.equal(false);
  }));

  it('should be identifiable', () => co(function*(){
    const e1 = engine();
    e1.isConnected().should.equal(false);
    (yield e1.status()).should.equal('ready');
    e1.isConnected().should.equal(true);
    (yield e1.setValue('identify', { pubkey: 'pub1', identifier: 'id1' })).should.equal('OK');
    (yield e1.getValue('pubkey')).should.equal('pub1');
    (yield e1.getValue('id')).should.equal('id1');
    yield new Promise((res) => setTimeout(res, 10));
  }));

  it('should be configurable', () => co(function*(){
    const e1 = engine();
    e1.isConnected().should.equal(false);
    (yield e1.status()).should.equal('ready');
    e1.isConnected().should.equal(true);
    (yield e1.setValue('conf', { cpu: 0.2, prefix: '34' })).should.deepEqual({ currentCPU: 0.2, prefix: 34000000000000 });
    (yield e1.getValue('cpu')).should.equal(0.2);
    (yield e1.getValue('prefix')).should.equal(34000000000000);
  }));

  it('should be able to make a proof', () => co(function*(){
    const e1 = engine();
    (yield e1.status()).should.equal('ready');
    (yield e1.setValue('identify', { pubkey: 'pub1', identifier: 'id1' })).should.equal('OK');
    const block = { number: 29 };
    const nonceBeginning = 0;
    const zeros = 2;
    const highMark = 'A';
    const pair = {
      pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
      sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
    };
    const forcedTime = 1;
    const medianTimeBlocks = 20;
    const avgGenTime = 5 * 60;
    const proof = yield e1.prove(block, nonceBeginning, zeros, highMark, pair, forcedTime, medianTimeBlocks, avgGenTime);
    proof.should.deepEqual({
      pow: {
        block: {
          number: 29,
          time: 1,
          inner_hash: 'B86E1870C06C353B9B0AC759AD800052EB51BE901F88678D08CF3E6FA8D026D1',
          nonce: 26,
          hash: '001E732E9376135C52CB5EF169B3F84B27A7C6F7644424D8966E4168077B8458',
          signature: 'IibV85B58R9H/IvwJjxgHGLo/6lCcXX8L0vL5fjZ2jp0MiWd9/4NWj7Ofi7iQW4t3uvlgAHJfDqCmuQqeZRCCQ=='
        },
        testsCount: 25,
        pow: '001E732E9376135C52CB5EF169B3F84B27A7C6F7644424D8966E4168077B8458',
      }
    });
  }));

  it('should be able to stop a proof', () => co(function*(){
    const e1 = engine();
    (yield e1.status()).should.equal('ready');
    (yield e1.setValue('identify', { pubkey: 'pub1', identifier: 'id1' })).should.equal('OK');
    const block = { number: 26 };
    const nonceBeginning = 0;
    const zeros = 10; // Requires hundreds of thousands of tries probably
    const highMark = 'A';
    const pair = {
      pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
      sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
    };
    const forcedTime = 1;
    const medianTimeBlocks = 20;
    const proofPromise = e1.prove(block, nonceBeginning, zeros, highMark, pair, forcedTime, medianTimeBlocks);
    yield new Promise((res) => setTimeout(res, 100));
    (yield e1.cancel()).should.equal('cancelling');
    (yield e1.cancel()).should.equal('cancelling');
    const proof = yield proofPromise;
    (yield e1.cancel()).should.equal('ready');
    should.not.exist(proof);
  }));
});

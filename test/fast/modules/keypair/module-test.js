"use strict";
const should = require('should');
const co  = require('co');
const keypair = require('../../../../app/modules/keypair/index').KeypairDependency
const assert = require('assert');
const duniter = require('../../../../index')

describe('Module usage', () => {

  it('wrong options should throw', () => co(function*() {
    let errMessage;
    try {
      const stack = duniter.statics.minimalStack();
      stack.registerDependency(keypair, 'duniter-keypair');
      yield stack.executeStack(['node', 'index.js', 'config', '--memory', '--keyN', '2048']);
    } catch (e) {
      errMessage = e.message;
    }
    should.exist(errMessage);
    should.equal(errMessage, 'Missing --salt and --passwd options along with --keyN|keyr|keyp option');
  }));

  it('no options on brand new node should generate random key', () => co(function*() {
    const stack = duniter.statics.minimalStack();
    stack.registerDependency(keypair, 'duniter-keypair');
    const res = yield stack.executeStack(['node', 'index.js', 'config', '--memory']);
    // This is extremely very unlikely to happen
    res.pair.should.have.property('pub').not.equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    res.pair.should.have.property('sec').not.equal('51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP');
  }));
});

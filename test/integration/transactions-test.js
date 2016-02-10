"use strict";

var co = require('co');
var _ = require('underscore');
var should = require('should');
var assert = require('assert');
var constants = require('../../app/lib/constants');
var node   = require('./tools/node');
var user   = require('./tools/user');
var jspckg = require('../../package');
var commit    = require('./tools/commit');
var MEMORY_MODE = true;

describe("Integration", function() {

  describe("Testing transactions", function(){

    var node2 = node({ name: 'db2', memory: MEMORY_MODE }, { currency: 'cc', ipv4: 'localhost', port: 9998, remoteipv4: 'localhost', remoteport: 9998, upnp: false, httplogs: false,
      pair: {
        pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
        sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'
      },
      forksize: 3,
      participate: false, rootoffset: 10,
      sigQty: 1, dt: 0, ud0: 120
    });

    var tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, node2);
    var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, node2);

    before(function() {
      return node2.startTesting()
        .then(function(){
          return co(function *() {
            // Self certifications
            yield tic.selfCertP();
            yield toc.selfCertP();
            // Certification;
            yield tic.certP(toc);
            yield toc.certP(tic);
            yield tic.joinP();
            yield toc.joinP();
            yield node2.commitP();
            yield node2.commitP();
            yield tic.sendP(51, toc);
            yield node2.commitP();
          });
        });
    });
    after(node2.after());

    it('it should exist block#2 with UD of 120', node2.block(2, function(block, done){
      should.exists(block);
      assert.equal(block.number, 2);
      assert.equal(block.dividend, 120);
      done();
    }));

    it('tic should be able to send 51 to toc', node2.sourcesOf('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', function(res, done){
      should.exists(res);
      assert.equal(res.sources.length, 2);
      var txSrc = _.findWhere(res.sources, { type: 'T' });
      var udSrc = _.findWhere(res.sources, { type: 'D' });
      assert.equal(txSrc.amount, 69);
      assert.equal(udSrc.amount, 120);
      done();
    }));

    it('toc should have 151 of sources', node2.sourcesOf('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', function(res, done){
      should.exists(res);
      assert.equal(res.sources.length, 3);
      var txRes = _.findWhere(res.sources, { type: 'T' });
      var duRes = _.filter(res.sources, { type: 'D' });
      assert.equal(txRes.type, 'T');
      assert.equal(txRes.amount, 51);
      assert.equal(duRes[0].type, 'D');
      assert.equal(duRes[0].amount, 120);
      assert.equal(duRes[1].type, 'D');
      assert.equal(duRes[1].amount, 120);
      done();
    }));

    it('toc should be able to send 80 to tic', () => co(function *() {
      yield toc.sendP(200, tic);
      yield node2.commitP();
      let res = yield node2.sourcesOfP('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
      should.exists(res);
      assert.equal(res.sources.length, 2);
      var txRes = _.findWhere(res.sources, { type: 'T' });
      var duRes = _.filter(res.sources, { type: 'D' });
      assert.equal(txRes.type, 'T');
      assert.equal(txRes.amount, 91);
      assert.equal(duRes[0].type, 'D');
      assert.equal(duRes[0].amount, 120);
    }));
  });
});

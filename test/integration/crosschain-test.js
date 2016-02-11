"use strict";

var co = require('co');
var _ = require('underscore');
var assert = require('assert');
var should = require('should');
var rp        = require('request-promise');
var bma       = require('./../../app/lib/streams/bma');
var commit    = require('./tools/commit');
var ucoin  = require('./../../index');
var user   = require('./tools/user');
var unit   = require('./tools/unit');
var httpTest  = require('./tools/http');

describe("Crosschain transactions", function() {

  var MEMORY_MODE = true;
  var commonConf = {
    ipv4: '127.0.0.1',
    httpLogs: true,
    forksize: 3,
    dt: 0, ud0: 120, rootoffset: 10,
    parcatipate: false, // TODO: to remove when startGeneration will be an explicit call
    sigQty: 1
  };

  describe('Successfull transaction', () => {

    var sB = ucoin({
      memory: MEMORY_MODE,
      name: 'bb11'
    }, _.extend({
      currency: 'BETA_BROUZOUF',
      port: '8588',
      pair: {
        pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
        sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
      }
    }, commonConf));

    var sM = ucoin({
      memory: MEMORY_MODE,
      name: 'bb12'
    }, _.extend({
      currency: 'META_BROUZOUF',
      port: '8599',
      pair: {
        pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
        sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'
      }
    }, commonConf));

    // toc is on 2 currencies
    var tocB = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: sB });
    var tocM = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: sM });
    // tic is on 2 currencies
    var ticB = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: sB });
    var ticM = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: sM });

    let btx0, mtx0; // Source transactions for coins

    before(function() {

      return co(function *() {
        yield sB.initWithServices().then(bma);
        yield sM.initWithServices().then(bma);

        // Initialize BETA
        yield ticB.selfCertPromise();
        yield tocB.selfCertPromise();
        yield tocB.certPromise(ticB);
        yield ticB.certPromise(tocB);
        yield ticB.joinPromise();
        yield tocB.joinPromise();
        yield commit(sB)();
        yield commit(sB)();
        // Preparation: we create a source transaction for our transfer
        btx0 = yield tocB.prepareITX(120, tocB);
        // We submit it to the network
        yield tocB.sendTX(btx0);
        // Written
        yield commit(sB)();

        // Initialize META
        yield ticM.selfCertPromise();
        yield tocM.selfCertPromise();
        yield tocM.certPromise(ticM);
        yield ticM.certPromise(tocM);
        yield ticM.joinPromise();
        yield tocM.joinPromise();
        yield commit(sM)();
        yield commit(sM)();
        // Preparation: we create a source transaction for our transfer
        mtx0 = yield ticM.prepareITX(120, ticM);
        // We submit it to the network
        yield ticM.sendTX(mtx0);
        // Written
        yield commit(sM)();
      });
    });

    describe("check initial sources", function(){
      it('toc should now have 120 BETA_BROUZOUF from Transaction sources due to initial TX', checkHaveSources(tocB, 1, 120));
      it('tic should now have 120 META_BROUZOUF from Transaction sources due to initial TX', checkHaveSources(ticM, 1, 120));
      it('toc should now have 0 META_BROUZOUF from Transaction sources', checkHaveSources(tocM, 0, 0));
      it('tic should now have 0 BETA_BROUZOUF from Transaction sources', checkHaveSources(ticB, 0, 0));
    });

    describe('Transfering', () => {

      it("commit", () => co(function *() {

        // TOCB side (BETA)
        // 1. toc secretely chooses X password
        let btx1 = yield tocB.prepareUTX(btx0, ['SIG(0)'], [{ qty: 120, lock: '(XHX(8AFC8DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB) && SIG(' + ticB.pub + ')) || (SIG(' + tocB.pub + ') && SIG(' + ticB.pub + '))'  }], { comment: 'BETA toc to tic' });
        // 2. toc makes a rollback transaction from tx1, signed by both parties (through internet): toc and tic
        let btx2 = yield tocB.prepareMTX(btx1, ticB, ['XHX(0) SIG(1) SIG(0) SIG(1)'], [{ qty: 120, lock: 'SIG(' + tocB.pub + ')' }], { comment: 'money back to tocB in 48h', locktime: 0 }); // N.B.: locktime should be like 48h in real world

        // TICM side (META)
        // 3. tic generates a transaction based on H(X) given by toc (through internet)
        let mtx3 = yield ticM.prepareUTX(mtx0, ['SIG(0)'], [{ qty: 120, lock: '(XHX(8AFC8DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB) && SIG(' + tocM.pub + ')) || (SIG(' + ticM.pub + ') && SIG(' + tocM.pub + '))'  }], { comment: 'META tic to toc' });
        // 4. tic makes a rollback transaction from tx1, signed by both parties: toc and tic
        let mtx4 = yield ticM.prepareMTX(mtx3, tocM, ['XHX(0) SIG(1) SIG(0) SIG(1)'], [{ qty: 120, lock: 'SIG(' + tocB.pub + ')' }], { comment: 'money back to tocB', locktime: 0 }); // N.B.: locktime should be like 24h in real world

        // We submit TX1 to the network & write it
        yield tocB.sendTX(btx1);
        // Written
        yield commit(sB)();

        // We submit TX3 to the network & write it
        yield ticM.sendTX(mtx3);
        // Written
        yield commit(sM)();

        /**
         * So now ... parties can either COMMIT or ROLLBACK. It's UP to the initiator: TOC.
         *
         * Let's say TOC agrees & and start COMMIT.
         */

        // TOCM consumes TICM's offered money by revealing the password + signing
        let mtx5 = yield tocM.prepareUTX(mtx3, ['XHX(1872767826647264) SIG(0)'], [{ qty: 120, lock: 'SIG(' + tocM.pub + ')' }], { comment: 'toc takes money on META_BROUZOUF'});
        yield tocM.sendTX(mtx5);
        // Written
        yield commit(sM)();

        // But now X is revealed: TAC can takes the money offered in TX1 by TOCB
        let btx6 = yield ticB.prepareUTX(btx1, ['XHX(1872767826647264) SIG(0)'], [{ qty: 120, lock: 'SIG(' + ticB.pub + ')' }], { comment: 'tic takes money on BETA_BROUZOUF'});
        yield ticB.sendTX(btx6);
        // Written
        yield commit(sB)();

        /**
         * Now the transaction is fully COMMITTED! Look at rollback transactions: they will fail.
         */

        yield unit.shouldFail(tocB.sendTX(btx2), 'Source already consumed');
        yield unit.shouldFail(ticM.sendTX(mtx4), 'Source already consumed');
      }));

      it('toc should now have 0 BETA_BROUZOUF from Transaction sources due to COMMIT', function() {
        return httpTest.expectAnswer(rp('http://127.0.0.1:8588/tx/sources/' + tocB.pub, { json: true }), (res) => {
          var txRes = _.filter(res.sources, { type: 'T' });
          txRes.should.have.length(0);
        });
      });

      it('toc should now have 120 META_BROUZOUF from Transaction sources due to COMMIT', function() {
        return httpTest.expectAnswer(rp('http://127.0.0.1:8599/tx/sources/' + tocB.pub, { json: true }), (res) => {
          var txRes = _.filter(res.sources, { type: 'T' });
          txRes.should.have.length(1);
          assert.equal(txRes[0].amount, 120);
        });
      });

      it('tic should now have 0 META_BROUZOUF from Transaction sources due to COMMMIT', function() {
        return httpTest.expectAnswer(rp('http://127.0.0.1:8599/tx/sources/' + ticM.pub, { json: true }), (res) => {
          var txRes = _.filter(res.sources, { type: 'T' });
          txRes.should.have.length(0);
        });
      });

      it('tic should have 120 BETA_BROUZOUF from Transaction sources due to COMMIT', function() {
        return httpTest.expectAnswer(rp('http://127.0.0.1:8588/tx/sources/' + ticM.pub, { json: true }), (res) => {
          var txRes = _.filter(res.sources, { type: 'T' });
          txRes.should.have.length(1);
          assert.equal(txRes[0].amount, 120);
        });
      });
    });
  });

  describe('Rollbacked transaction', () => {

    var sB = ucoin({
      memory: MEMORY_MODE,
      name: 'bb11'
    }, _.extend({
      currency: 'BETA_BROUZOUF2',
      port: '8566',
      pair: {
        pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
        sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
      }
    }, commonConf));

    var sM = ucoin({
      memory: MEMORY_MODE,
      name: 'bb12'
    }, _.extend({
      currency: 'META_BROUZOUF2',
      port: '8577',
      pair: {
        pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
        sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'
      }
    }, commonConf));

    // toc is on 2 currencies
    var tocB = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: sB });
    var tocM = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: sM });
    // tic is on 2 currencies
    var ticB = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: sB });
    var ticM = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: sM });

    let btx0, mtx0; // Source transactions for coins

    before(function() {

      return co(function *() {
        yield sB.initWithServices().then(bma);
        yield sM.initWithServices().then(bma);

        // Initialize BETA
        yield ticB.selfCertPromise();
        yield tocB.selfCertPromise();
        yield tocB.certPromise(ticB);
        yield ticB.certPromise(tocB);
        yield ticB.joinPromise();
        yield tocB.joinPromise();
        yield commit(sB)();
        yield commit(sB)();
        // Preparation: we create a source transaction for our transfer
        btx0 = yield tocB.prepareITX(120, tocB);
        // We submit it to the network
        yield tocB.sendTX(btx0);
        // Written
        yield commit(sB)();

        // Initialize META
        yield ticM.selfCertPromise();
        yield tocM.selfCertPromise();
        yield tocM.certPromise(ticM);
        yield ticM.certPromise(tocM);
        yield ticM.joinPromise();
        yield tocM.joinPromise();
        yield commit(sM)();
        yield commit(sM)();
        // Preparation: we create a source transaction for our transfer
        mtx0 = yield ticM.prepareITX(120, ticM);
        // We submit it to the network
        yield ticM.sendTX(mtx0);
        // Written
        yield commit(sM)();
      });
    });

    describe("check initial sources", function(){
      it('toc should now have 120 BETA_BROUZOUF from Transaction sources due to initial TX', checkHaveSources(tocB, 1, 120));
      it('tic should now have 120 META_BROUZOUF from Transaction sources due to initial TX', checkHaveSources(ticM, 1, 120));
      it('toc should now have 0 META_BROUZOUF from Transaction sources', checkHaveSources(tocM, 0, 0));
      it('tic should now have 0 BETA_BROUZOUF from Transaction sources', checkHaveSources(ticB, 0, 0));
    });

    describe('Transfering', () => {

      it("commit", () => co(function *() {

        // TOCB side (BETA)
        // 1. toc secretely chooses X password
        let btx1 = yield tocB.prepareUTX(btx0, ['SIG(0)'], [{ qty: 120, lock: '(XHX(8AFC8DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB) && SIG(' + ticB.pub + ')) || (SIG(' + tocB.pub + ') && SIG(' + ticB.pub + '))'  }], { comment: 'BETA toc to tic' });
        // 2. toc makes a rollback transaction from tx1, signed by both parties (through internet): toc and tic
        let btx2 = yield tocB.prepareMTX(btx1, ticB, ['XHX(0) SIG(1) SIG(0) SIG(1)'], [{ qty: 120, lock: 'SIG(' + tocB.pub + ')' }], { comment: 'money back to tocB in 48h', locktime: 0 }); // N.B.: locktime should be like 48h in real world

        // TICM side (META)
        // 3. tic generates a transaction based on H(X) given by toc (through internet)
        let mtx3 = yield ticM.prepareUTX(mtx0, ['SIG(0)'], [{ qty: 120, lock: '(XHX(8AFC8DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB) && SIG(' + tocM.pub + ')) || (SIG(' + ticM.pub + ') && SIG(' + tocM.pub + '))'  }], { comment: 'META tic to toc' });
        // 4. tic makes a rollback transaction from tx1, signed by both parties: toc and tic
        let mtx4 = yield ticM.prepareMTX(mtx3, tocM, ['XHX(0) SIG(1) SIG(0) SIG(1)'], [{ qty: 120, lock: 'SIG(' + ticM.pub + ')' }], { comment: 'money back to ticM', locktime: 0 }); // N.B.: locktime should be like 24h in real world

        // We submit TX1 to the network & write it
        yield tocB.sendTX(btx1);
        // Written
        yield commit(sB)();

        // We submit TX3 to the network & write it
        yield ticM.sendTX(mtx3);
        // Written
        yield commit(sM)();

        /**
         * So now ... parties can either COMMIT or ROLLBACK. It's UP to the initiator: TOC.
         *
         * Let's say TOC wants to stop and ROLLBACK.
         */

        yield unit.shouldNotFail(tocB.sendTX(btx2));
        // Written
        yield commit(sB)();
        yield unit.shouldNotFail(ticM.sendTX(mtx4));
        // Written
        yield commit(sM)();

        /**
         * Now the transaction is fully COMMITTED! Look at rollback transactions: they will fail.
         */

        // TOCM consumes TICM's offered money by revealing the password + signing
        let mtx5 = yield tocM.prepareUTX(mtx3, ['XHX(1872767826647264) SIG(0)'], [{ qty: 120, lock: 'SIG(' + tocM.pub + ')' }], { comment: 'toc takes money on META_BROUZOUF'});

        // Assuming X was revealed ... but actually it is not since TOCM did succeed to send the TX
        let btx6 = yield ticB.prepareUTX(btx1, ['XHX(1872767826647264) SIG(0)'], [{ qty: 120, lock: 'SIG(' + ticB.pub + ')' }], { comment: 'tic takes money on BETA_BROUZOUF'});

        yield unit.shouldFail(tocB.sendTX(btx6), 'Source already consumed');
        yield unit.shouldFail(ticM.sendTX(mtx5), 'Source already consumed');
      }));

      it('toc should now have 120 BETA_BROUZOUF from Transaction sources due to rollback TX', checkHaveSources(tocB, 1, 120));
      it('tic should now have 120 META_BROUZOUF from Transaction sources due to rollback TX', checkHaveSources(ticM, 1, 120));
      it('toc should now have 0 META_BROUZOUF from Transaction sources', checkHaveSources(tocM, 0, 0));
      it('tic should now have 0 BETA_BROUZOUF from Transaction sources', checkHaveSources(ticB, 0, 0));
    });
  });
});

function checkHaveSources(theUser, sourcesCount, sourcesTotalAmount) {
  return function() {
    return httpTest.expectAnswer(rp('http://' + theUser.node.server.conf.ipv4 + ':' + theUser.node.server.conf.port + '/tx/sources/' + theUser.pub, { json: true }), (res) => {
      var txRes = _.filter(res.sources, { type: 'T' });
      txRes.should.have.length(sourcesCount);
      let sum = 0;
      for (let i = 0, len = txRes.length; i < len; i++) {
        sum += txRes[i].amount;
      }
      assert.equal(sum, sourcesTotalAmount);
    });
  };
}

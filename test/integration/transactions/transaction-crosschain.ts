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

import {NewTestingServer, TestingServer} from "../tools/toolbox"
import {TestUser} from "../tools/TestUser"
import {Underscore} from "../../../app/lib/common-libs/underscore"
import {HttpSources} from "../../../app/modules/bma/lib/dtos"

const assert = require('assert');
const should = require('should');
const rp        = require('request-promise');
const unit   = require('../tools/unit');
const httpTest  = require('../tools/http');

/**
 * Test Crosschain algorithm described at https://en.bitcoin.it/wiki/Atomic_cross-chain_trading
 */

describe("Crosschain transactions", function() {

  const now = 1487000000;

  const MEMORY_MODE = true;
  const commonConf = {
    httpLogs: true,
    forksize: 3,
    dt: 1, ud0: 120, rootoffset: 10,
    sigQty: 1,
    udTime0: now + 1
  };

  describe('Successfull transaction', () => {

    let sB:TestingServer, sM:TestingServer, tocB:TestUser, tocM:TestUser, ticB:TestUser, ticM:TestUser, btx0:string, mtx0:string; // Source transactions for coins

    before(async () => {

      sB = NewTestingServer(Underscore.extend({
        memory: MEMORY_MODE,
        name: 'bb11',
        currency: 'BETA_BROUZOUF',
        pair: {
          pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
          sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
        }
      }, commonConf));

      sM = NewTestingServer(Underscore.extend({
        memory: MEMORY_MODE,
        name: 'bb12',
        currency: 'META_BROUZOUF',
        pair: {
          pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
          sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'
        }
      }, commonConf));

      // toc is on 2 currencies
      tocB = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: sB });
      tocM = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: sM });
      // tic is on 2 currencies
      ticB = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: sB });
      ticM = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: sM });

      await sB.initDalBmaConnections();
      await sM.initDalBmaConnections();

      // Initialize BETA
      await ticB.createIdentity();
      await tocB.createIdentity();
      await tocB.cert(ticB);
      await ticB.cert(tocB);
      await ticB.join();
      await tocB.join();
      await sB.commit({ time: now });
      await sB.commit({ time: now + 10 });
      await sB.commit({ time: now + 10 });
      // Preparation: we create a source transaction for our transfer
      btx0 = await tocB.prepareITX(120, tocB);
      // We submit it to the network
      await tocB.sendTX(btx0);
      // Written
      await sB.commit({ time: now + 10 });

      // Initialize META
      await ticM.createIdentity();
      await tocM.createIdentity();
      await tocM.cert(ticM);
      await ticM.cert(tocM);
      await ticM.join();
      await tocM.join();
      await sM.commit({ time: now });
      await sM.commit({ time: now + 10 });
      await sM.commit({ time: now + 10 });
      // Preparation: we create a source transaction for our transfer
      mtx0 = await ticM.prepareITX(120, ticM);
      // We submit it to the network
      await ticM.sendTX(mtx0);
      // Written
      await sM.commit({ time: now + 10 });
    })

    after(() => {
      return Promise.all([
        sB.closeCluster(),
        sM.closeCluster()
      ])
    })

    describe("check initial sources", function(){
      it('toc should now have 120 BETA_BROUZOUF from Transaction sources due to initial TX', () => checkHaveSources(tocB, 1, 120));
      it('tic should now have 120 META_BROUZOUF from Transaction sources due to initial TX', () => checkHaveSources(ticM, 1, 120));
      it('toc should now have 0 META_BROUZOUF from Transaction sources', () => checkHaveSources(tocM, 0, 0));
      it('tic should now have 0 BETA_BROUZOUF from Transaction sources', () => checkHaveSources(ticB, 0, 0));
    });

    describe('Transfering', () => {

      it("commit", async () => {

        const currentB = await sB.get('/blockchain/current');
        const blockstampB = [currentB.number, currentB.hash].join('-');

        const currentM = await sM.get('/blockchain/current');
        const blockstampM = [currentM.number, currentM.hash].join('-');

        // TOCB side (BETA)
        // 1. toc secretely chooses X password
        let btx1 = await tocB.prepareUTX(btx0, ['SIG(0)'], [{ qty: 120, base: 0, lock: '(XHX(8AFC8DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB) && SIG(' + ticB.pub + ')) || (SIG(' + tocB.pub + ') && SIG(' + ticB.pub + '))'  }], { comment: 'BETA toc to tic', blockstamp: blockstampB });
        // 2. toc makes a rollback transaction from tx1, signed by both parties (through internet): toc and tic
        let btx2 = await tocB.prepareMTX(btx1, ticB, ['XHX(0) SIG(1) SIG(0) SIG(1)'], [{ qty: 120, base: 0, lock: 'SIG(' + tocB.pub + ')' }], { comment: 'money back to tocB in 48h', locktime: 3600 * 48, blockstamp: blockstampB }); // N.B.: locktime should be like 48h in real world

        // TICM side (META)
        // 3. tic generates a transaction based on H(X) given by toc (through internet)
        let mtx3 = await ticM.prepareUTX(mtx0, ['SIG(0)'], [{ qty: 120, base: 0, lock: '(XHX(8AFC8DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB) && SIG(' + tocM.pub + ')) || (SIG(' + ticM.pub + ') && SIG(' + tocM.pub + '))'  }], { comment: 'META tic to toc', blockstamp: blockstampM });
        // 4. tic makes a rollback transaction from tx1, signed by both parties: toc and tic
        let mtx4 = await ticM.prepareMTX(mtx3, tocM, ['XHX(0) SIG(1) SIG(0) SIG(1)'], [{ qty: 120, base: 0, lock: 'SIG(' + ticM.pub + ')' }], { comment: 'money back to ticM', locktime: 3600 * 24, blockstamp: blockstampM }); // N.B.: locktime should be like 24h in real world

        // We submit TX1 to the network & write it
        await tocB.sendTX(btx1);
        // Written
        await sB.commit({ time: now + 10 });

        // We submit TX3 to the network & write it
        await ticM.sendTX(mtx3);
        // Written
        await sM.commit({ time: now + 10 });

        /**
         * So now ... parties can either COMMIT or ROLLBACK. It's UP to the initiator: TOC.
         */

        /**
         * Note: the ROLLBACK transactions have a locktime, and cannot be used before that delay.
         */
        await unit.shouldFail(ticM.sendTX(mtx4), 'Locktime not elapsed yet');
        await unit.shouldFail(tocB.sendTX(btx2), 'Locktime not elapsed yet');

        /**
         * Let's say TOC agrees & and start COMMIT.
         */

        // TOCM consumes TICM's offered money by revealing the password + signing
        let mtx5 = await tocM.prepareUTX(mtx3, ['XHX(1872767826647264) SIG(0)'], [{ qty: 120, base: 0, lock: 'SIG(' + tocM.pub + ')' }], { comment: 'toc takes money on META_BROUZOUF', blockstamp: blockstampM });
        await tocM.sendTX(mtx5);
        // Written
        await sM.commit();

        // But now X is revealed: TAC can takes the money offered in TX1 by TOCB
        let btx6 = await ticB.prepareUTX(btx1, ['XHX(1872767826647264) SIG(0)'], [{ qty: 120, base: 0, lock: 'SIG(' + ticB.pub + ')' }], { comment: 'tic takes money on BETA_BROUZOUF', blockstamp: blockstampB });
        await ticB.sendTX(btx6);
        // Written
        await sB.commit();

        /**
         * Now the transaction is fully COMMITTED! Look at rollback transactions: they will fail.
         */

        await unit.shouldFail(tocB.sendTX(btx2), 'Source already consumed');
        await unit.shouldFail(ticM.sendTX(mtx4), 'Source already consumed');
      })

      it('toc should now have 0 BETA_BROUZOUF from Transaction sources due to COMMIT', () => {
        return sB.expect('/tx/sources/' + tocB.pub, (res:HttpSources) => {
          const txRes = Underscore.where(res.sources, { type: 'T' });
          txRes.should.have.length(0);
        });
      });

      it('toc should now have 120 META_BROUZOUF from Transaction sources due to COMMIT', () => {
        return sM.expect('/tx/sources/' + tocB.pub, (res:HttpSources) => {
          const txRes = Underscore.where(res.sources, { type: 'T' });
          txRes.should.have.length(1);
          assert.equal(txRes[0].amount, 120);
        });
      });

      it('tic should now have 0 META_BROUZOUF from Transaction sources due to COMMMIT', () => {
        return sM.expect('/tx/sources/' + ticM.pub, (res:HttpSources) => {
          const txRes = Underscore.where(res.sources, { type: 'T' });
          txRes.should.have.length(0);
        });
      });

      it('tic should have 120 BETA_BROUZOUF from Transaction sources due to COMMIT', () => {
        return sB.expect('/tx/sources/' + ticM.pub, (res:HttpSources) => {
          const txRes = Underscore.where(res.sources, { type: 'T' });
          txRes.should.have.length(1);
          assert.equal(txRes[0].amount, 120);
        });
      });
    });
  });

  describe('Rollbacked transaction', () => {

    let sB:TestingServer, sM:TestingServer, tocB:TestUser, tocM:TestUser, ticB:TestUser, ticM:TestUser, btx0:string, mtx0:string; // Source transactions for coins

    before(async () => {

      sB = NewTestingServer(Underscore.extend({
        memory: MEMORY_MODE,
        name: 'bb11',
        currency: 'BETA_BROUZOUF2',
        pair: {
          pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
          sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
        }
      }, commonConf))

      sM = NewTestingServer(Underscore.extend({
        memory: MEMORY_MODE,
        name: 'bb12',
        currency: 'META_BROUZOUF2',
        pair: {
          pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
          sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'
        }
      }, commonConf));

      // toc is on 2 currencies
      tocB = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: sB });
      tocM = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: sM });
      // tic is on 2 currencies
      ticB = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: sB });
      ticM = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: sM });

      await sB.initDalBmaConnections();
      await sM.initDalBmaConnections()

      // Initialize BETA
      await ticB.createIdentity();
      await tocB.createIdentity();
      await tocB.cert(ticB);
      await ticB.cert(tocB);
      await ticB.join();
      await tocB.join();
      await sB.commit({ time: now });
      await sB.commit({ time: now + 10 });
      await sB.commit({ time: now + 10 });
      // Preparation: we create a source transaction for our transfer
      btx0 = await tocB.prepareITX(120, tocB);
      // We submit it to the network
      await tocB.sendTX(btx0);
      // Written
      await sB.commit({ time: now + 10 });

      // Initialize META
      await ticM.createIdentity();
      await tocM.createIdentity();
      await tocM.cert(ticM);
      await ticM.cert(tocM);
      await ticM.join();
      await tocM.join();
      await sM.commit({ time: now });
      await sM.commit({ time: now + 10 });
      await sM.commit({ time: now + 10 });
      // Preparation: we create a source transaction for our transfer
      mtx0 = await ticM.prepareITX(120, ticM);
      // We submit it to the network
      await ticM.sendTX(mtx0);
      // Written
      await sM.commit({ time: now + 10 });
    });

    after(() => {
      return Promise.all([
        sB.closeCluster(),
        sM.closeCluster()
      ])
    })

    describe("check initial sources", function(){
      it('toc should now have 120 BETA_BROUZOUF from Transaction sources due to initial TX', () => checkHaveSources(tocB, 1, 120));
      it('tic should now have 120 META_BROUZOUF from Transaction sources due to initial TX', () => checkHaveSources(ticM, 1, 120));
      it('toc should now have 0 META_BROUZOUF from Transaction sources', () => checkHaveSources(tocM, 0, 0));
      it('tic should now have 0 BETA_BROUZOUF from Transaction sources', () => checkHaveSources(ticB, 0, 0));
    });

    describe('Transfering', () => {

      it("commit", async () => {

        const currentB = await sB.get('/blockchain/current');
        const blockstampB = [currentB.number, currentB.hash].join('-');

        const currentM = await sM.get('/blockchain/current');
        const blockstampM = [currentM.number, currentM.hash].join('-');

        // TOCB side (BETA)
        // 1. toc secretely chooses X password
        let btx1 = await tocB.prepareUTX(btx0, ['SIG(0)'], [{ qty: 120, base: 0, lock: '(XHX(8AFC8DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB) && SIG(' + ticB.pub + ')) || (SIG(' + tocB.pub + ') && SIG(' + ticB.pub + '))'  }], { comment: 'BETA toc to tic', blockstamp: blockstampB });
        // 2. toc makes a rollback transaction from tx1, signed by both parties (through internet): toc and tic
        let btx2 = await tocB.prepareMTX(btx1, ticB, ['SIG(0) SIG(1)'], [{ qty: 120, base: 0, lock: 'SIG(' + tocB.pub + ')' }], { comment: 'money back to tocB in 48h', locktime: 3, blockstamp: blockstampB }); // N.B.: locktime should be like 48h in real world

        // TICM side (META)
        // 3. tic generates a transaction based on H(X) given by toc (through internet)
        let mtx3 = await ticM.prepareUTX(mtx0, ['SIG(0)'], [{ qty: 120, base: 0, lock: '(XHX(8AFC8DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB) && SIG(' + tocM.pub + ')) || (SIG(' + ticM.pub + ') && SIG(' + tocM.pub + '))'  }], { comment: 'META tic to toc', blockstamp: blockstampM });
        // 4. tic makes a rollback transaction from tx1, signed by both parties: toc and tic
        let mtx4 = await ticM.prepareMTX(mtx3, tocM, ['SIG(0) SIG(1)'], [{ qty: 120, base: 0, lock: 'SIG(' + ticM.pub + ')' }], { comment: 'money back to ticM', locktime: 2, blockstamp: blockstampM }); // N.B.: locktime should be like 24h in real world

        // We submit TX1 to the network & write it
        await tocB.sendTX(btx1);
        // Written
        await sB.commit({ time: now + 12 });

        // We submit TX3 to the network & write it
        await ticM.sendTX(mtx3);
        // Written
        await sM.commit({ time: now + 12 });

        /**
         * So now ... parties can either COMMIT or ROLLBACK. It's UP to the initiator: TOC.
         *
         * Let's say TOC wants to stop and ROLLBACK.
         */

        /**
         * Note: the ROLLBACK transactions have a locktime, and cannot be used before that delay.
         */
        await unit.shouldFail(ticM.sendTX(mtx4), 'Locktime not elapsed yet');
        await unit.shouldFail(tocB.sendTX(btx2), 'Locktime not elapsed yet');

        // Increment the medianTime by 1
        await sM.commit({ time: now + 12 });
        await sB.commit({ time: now + 14 });

        await unit.shouldNotFail(ticM.sendTX(mtx4)); // tic can rollback early (24h in real case) if toc does not reveal X
        await unit.shouldFail(tocB.sendTX(btx2), 'Locktime not elapsed yet'); // This one has a longer locktime (48h in real case)

        // Rollback for TIC(M) should be done
        await sM.commit({ time: now + 12 });

        // Make the medianTime increment by 1
        await sB.commit({ time: now + 14 });

        await unit.shouldNotFail(tocB.sendTX(btx2)); // toc can rollback now (48h has passed). He has not revealed X, so he is safe.
        await sB.commit({ time: now + 14 });

        /**
         * Now the transaction is fully COMMITTED! Look at rollback transactions: they will fail.
         */

        // TOCM consumes TICM's offered money by revealing the password + signing
        let mtx5 = await tocM.prepareUTX(mtx3, ['XHX(1872767826647264) SIG(0)'], [{ qty: 120, base: 0, lock: 'SIG(' + tocM.pub + ')' }], { comment: 'toc takes money on META_BROUZOUF', blockstamp: blockstampM });

        // Assuming X was revealed ... but actually it is not since TOCM did succeed to send the TX
        let btx6 = await ticB.prepareUTX(btx1, ['XHX(1872767826647264) SIG(0)'], [{ qty: 120, base: 0, lock: 'SIG(' + ticB.pub + ')' }], { comment: 'tic takes money on BETA_BROUZOUF', blockstamp: blockstampB });

        await unit.shouldFail(tocB.sendTX(btx6), 'Source already consumed');
        await unit.shouldFail(ticM.sendTX(mtx5), 'Source already consumed');
      })

      it('toc should now have 120 BETA_BROUZOUF from Transaction sources due to rollback TX', () => checkHaveSources(tocB, 1, 120));
      it('tic should now have 120 META_BROUZOUF from Transaction sources due to rollback TX', () => checkHaveSources(ticM, 1, 120));
      it('toc should now have 0 META_BROUZOUF from Transaction sources', () => checkHaveSources(tocM, 0, 0));
      it('tic should now have 0 BETA_BROUZOUF from Transaction sources', () => checkHaveSources(ticB, 0, 0));
    })
  });
});

function checkHaveSources(theUser:TestUser, sourcesCount:number, sourcesTotalAmount:number) {
  return httpTest.expectAnswer(rp('http://' + theUser.node.server.conf.ipv4 + ':' + theUser.node.server.conf.port + '/tx/sources/' + theUser.pub, { json: true }), (res:HttpSources) => {
    const txRes = Underscore.where(res.sources, { type: 'T' })
    txRes.should.have.length(sourcesCount);
    let sum = 0;
    for (const result of txRes) {
      sum += result.amount;
    }
    assert.equal(sum, sourcesTotalAmount);
  });
}

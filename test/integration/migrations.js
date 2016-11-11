"use strict";

const co = require('co');
const _ = require('underscore');
const should = require('should');
const assert = require('assert');
const constants = require('../../app/lib/constants');
const node   = require('./tools/node');
const unit   = require('./tools/unit');

describe("Migration", function() {

  /**
   * This test is where we had a problem, let's reproduce it.
   */

  describe("Old history", node.statics.newBasicTxNodeWithOldDatabase((node) => {

    it('it should NOT exist anything for toc', node.expectHttp('/tx/history/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', (res) => {
      res.should.have.property('pubkey').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
      res.should.have.property('history').property('sent').length(0);
      res.should.have.property('history').property('sending').length(0);
      res.should.have.property('history').property('received').length(0);
      res.should.have.property('history').property('pending').length(0);
      res.should.have.property('history').property('receiving').length(0); // This one is dead code
    }));

    it('it should exist a sending transaction for tic', node.expectHttp('/tx/history/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', (res) => {
      res.should.have.property('pubkey').equal('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV');
      res.should.have.property('history').property('sent').length(0);
      res.should.have.property('history').property('sending').length(1);
      res.should.have.property('history').property('received').length(0);
      res.should.have.property('history').property('pending').length(0);
    }));

    it('should be able to commit the transaction', () => co(function*() {
      yield node.commitP();
      // The recipients are wrongly valued in this version
      yield node.server.dal.txsDAL.exec('UPDATE txs SET recipients = "[]";');
    }));

    it('it should NOT exist anything for toc, again', node.expectHttp('/tx/history/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', (res) => {
      res.should.have.property('pubkey').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
      res.should.have.property('history').property('sent').length(0);
      res.should.have.property('history').property('sending').length(0);
      res.should.have.property('history').property('received').length(0);
      res.should.have.property('history').property('pending').length(0);
      res.should.have.property('history').property('receiving').length(0); // This one is dead code
    }));

    it('it should exist a sent transaction for tic', node.expectHttp('/tx/history/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', (res) => {
      res.should.have.property('pubkey').equal('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV');
      res.should.have.property('history').property('sent').length(1);
      res.should.have.property('history').property('sending').length(0);
      res.should.have.property('history').property('received').length(0);
      res.should.have.property('history').property('pending').length(0);
    }));

    /**
     * Now we use the migration fix, and all should be OK
     */

    it('should be able to fix the issue', () => co(function*() {
      yield node.server.dal.metaDAL.upgradeDatabaseVersions([3,4,5]);
    }));

    it('it should exist a received tx for toc', node.expectHttp('/tx/history/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', (res) => {
      res.should.have.property('pubkey').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
      res.should.have.property('history').property('sent').length(0);
      res.should.have.property('history').property('sending').length(0);
      res.should.have.property('history').property('received').length(1);
      res.should.have.property('history').property('pending').length(0);
      res.should.have.property('history').property('receiving').length(0); // This one is dead code
    }));

    it('it should exist a sent+received transaction for tic', node.expectHttp('/tx/history/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', (res) => {
      res.should.have.property('pubkey').equal('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV');
      res.should.have.property('history').property('sent').length(1);
      res.should.have.property('history').property('sending').length(0);
      res.should.have.property('history').property('received').length(1); // The rest
      res.should.have.property('history').property('pending').length(0);
    }));
  }));

  /**
   * Also, new history should be just OK
   */

  describe("New history", node.statics.newBasicTxNode((node) => {

    it('it should exist a pending tx for toc', node.expectHttp('/tx/history/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', (res) => {
      res.should.have.property('pubkey').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
      res.should.have.property('history').property('sent').length(0);
      res.should.have.property('history').property('sending').length(0);
      res.should.have.property('history').property('received').length(0);
      res.should.have.property('history').property('pending').length(1);
      res.should.have.property('history').property('receiving').length(0); // This one is dead code
    }));

    it('it should exist a sending transaction for tic', node.expectHttp('/tx/history/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', (res) => {
      res.should.have.property('pubkey').equal('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV');
      res.should.have.property('history').property('sent').length(0);
      res.should.have.property('history').property('sending').length(1);
      res.should.have.property('history').property('received').length(0);
      res.should.have.property('history').property('pending').length(1); // A rest is pending
    }));

    it('should be able to commit the transaction', () => co(function*() {
      yield node.commitP();
    }));

    it('it should exist a received tx for toc', node.expectHttp('/tx/history/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', (res) => {
      res.should.have.property('pubkey').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
      res.should.have.property('history').property('sent').length(0);
      res.should.have.property('history').property('sending').length(0);
      res.should.have.property('history').property('received').length(1);
      res.should.have.property('history').property('pending').length(0);
      res.should.have.property('history').property('receiving').length(0); // This one is dead code
    }));

    it('it should exist a sent+received transaction for tic', node.expectHttp('/tx/history/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', (res) => {
      res.should.have.property('pubkey').equal('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV');
      res.should.have.property('history').property('sent').length(1);
      res.should.have.property('history').property('sending').length(0);
      res.should.have.property('history').property('received').length(1); // The rest
      res.should.have.property('history').property('pending').length(0);
    }));
  }));
});

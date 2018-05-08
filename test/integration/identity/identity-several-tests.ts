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

import {TestUser} from "../tools/TestUser"
import {BmaDependency} from "../../../app/modules/bma/index"
import {HttpBlock, HttpLookup, HttpSigned, HttpSummary} from "../../../app/modules/bma/lib/dtos"
import {NewTestingServer, TestingServer} from "../tools/toolbox"
import {Underscore} from "../../../app/lib/common-libs/underscore"

const should = require('should');
const assert = require('assert');
const request = require('request');
const constants = require('../../../app/lib/constants');
const node   = require('../tools/node');
const jspckg = require('../../../package');
const httpTest  = require('../tools/http');
const shutDownEngine  = require('../tools/shutDownEngine');
const rp        = require('request-promise');

const expectAnswer   = httpTest.expectAnswer;
const MEMORY_MODE = true;

BmaDependency.duniter.methods.noLimit(); // Disables the HTTP limiter

describe("Integration", function() {

  describe("Node 1", function() {

    const node1 = node('db1', { upnp: false, currency: 'bb', ipv4: 'localhost', port: 9999, remoteipv4: 'localhost', remoteport: 9999, httplogs: false,
      rootoffset: 0,
      sigQty: 1,
      pair: {
        pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
      }
    });

    const cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, node1);
    const tac = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, node1);
    const tic = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, node1);
    const toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, node1);

    before(function(done) {
      node1.startTesting()
        .then(function(){
          node1.before([])(done);
        });
    });

    describe("Testing technical API", function(){

      before(function(done) {
        node1.before([])(done);
      });
      after(node1.after());

      it('/node/summary should give package.json version', node1.summary(function(summary:HttpSummary, done:any){
        should.exists(summary);
        should.exists(summary.duniter);
        should.exists(summary.duniter.software);
        should.exists(summary.duniter.version);
        assert.equal(summary.duniter.software, "duniter");
        assert.equal(summary.duniter.version, jspckg.version);
        done();
      }));
    });

    describe("Testing malformed documents", function(){

      before(function(done) {
        node1.before(function(node1) {

          const malformedTransaction = "Version: 2\n" +
            "Type: Transaction\n" +
            "Currency: null\n" +
            "Issuers:\n" +
            "G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU\n" +
            "Inputs:\n" +
            "0:T:1536:539CB0E60CD5F55CF1BE96F067E73BF55C052112:1.0\n" +
            "Outputs:Comment: mon comments\n";


          function sendRaw (raw:string) {
            return function(done:any) {
              post('/tx/process', {
                "transaction": raw
              }, done);
            }
          }

          function post(uri:string, data:any, done:any) {
            const postReq = request.post({
              "uri": 'http://' + [node1.server.conf.remoteipv4, node1.server.conf.remoteport].join(':') + uri,
              "timeout": 1000 * 10
            }, function (err:any, res:any, body:any) {
              done(err, res, body);
            });
            postReq.form(data);
          }
          return [
            sendRaw(malformedTransaction)
          ];
        }(node1))(done);
      });
      after(node1.after());

      it('should not have crashed because of wrong tx', function(){
        assert.equal(true, true);
      });
    });

    describe("Lookup on", function(){

      before(async () => {

        // Self certifications
        await cat.createIdentity();
        await tac.createIdentity();
        await tic.createIdentity();
        await toc.createIdentity();
        // Certifications
        await cat.cert(tac);
      });

      after(node1.after());

      describe("identities collisions", () => {

        it("sending same identity should fail", async () => {

          // We send again the same
          try {
            await tic.createIdentity();
            throw 'Should have thrown an error';
          } catch (e) {
            JSON.parse(e).ucode.should.equal(constants.ERRORS.ALREADY_UP_TO_DATE.uerr.ucode);
          }
        })

        it("sending same identity (again) should fail", async () => {

          // We send again the same
          try {
            await tic.createIdentity();
            throw 'Should have thrown an error';
          } catch (e) {
            JSON.parse(e).ucode.should.equal(constants.ERRORS.ALREADY_UP_TO_DATE.uerr.ucode);
          }
        })
      });

      describe("user cat", function(){

        it('should give only 1 result', node1.lookup('cat', function(res:HttpLookup, done:any){
          should.exists(res);
          assert.equal(res.results.length, 1);
          done();
        }));

        it('should have sent 1 signature', node1.lookup('cat', function(res:HttpLookup, done:any){
          should.exists(res);
          assert.equal(res.results[0].signed.length, 1);
          should.exists(res.results[0].signed[0].isMember);
          should.exists(res.results[0].signed[0].wasMember);
          assert.equal(res.results[0].signed[0].isMember, false);
          assert.equal(res.results[0].signed[0].wasMember, false);
          done();
        }));
      });

      describe("user tac", function(){

        it('should give only 1 result', node1.lookup('tac', function(res:HttpLookup, done:any){
          should.exists(res);
          assert.equal(res.results.length, 1);
          done();
        }));

        it('should have 1 signature', node1.lookup('tac', function(res:HttpLookup, done:any){
          should.exists(res);
          assert.equal(res.results[0].uids[0].others.length, 1);
          done();
        }));

        it('should have sent 0 signature', node1.lookup('tac', function(res:HttpLookup, done:any){
          should.exists(res);
          assert.equal(res.results[0].signed.length, 0);
          done();
        }));
      });

      it('toc should give only 1 result', node1.lookup('toc', function(res:HttpLookup, done:any){
        should.exists(res);
        assert.equal(res.results.length, 1);
        done();
      }));

      it('tic should give only 1 result', node1.lookup('tic', function(res:HttpLookup, done:any){
        should.exists(res);
        assert.equal(res.results.length, 1);
        done();
      }));
    });
  });

  describe("Testing leavers", function(){

    let node3:TestingServer, cat:TestUser, tac:TestUser, tic:TestUser, toc:TestUser

    before(async () => {

      node3 = NewTestingServer({
        name: 'db3',
        memory: MEMORY_MODE,
        currency: 'dd', ipv4: 'localhost', port: 9997, remoteipv4: 'localhost', remoteport: 9997, httplogs: false,
        rootoffset: 0,
        sigQty: 1, sigPeriod: 0,
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        }
      });

      cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: node3 });
      tac = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: node3 });
      tic = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: node3 });
      toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: node3 });

      await node3.initWithDAL().then(BmaDependency.duniter.methods.bma).then((bmapi) => bmapi.openConnections());
      const now = 1482220000;

      // Self certifications
      await cat.createIdentity();
      await tac.createIdentity();
      await tic.createIdentity();
      await toc.createIdentity();
      await cat.cert(tac);
      await cat.cert(tic);
      await cat.cert(toc);
      await tac.cert(cat);
      await tac.cert(tic);
      await tic.cert(cat);
      await tic.cert(tac);
      await toc.cert(cat);
      await cat.join();
      await tac.join();
      await tic.join();
      await toc.join();
      await node3.commit({
        time: now
      });
      await node3.commit({
        time: now
      });
      await toc.leave();
      await node3.commit({
        time: now
      });
      await tac.cert(toc);
      await tic.cert(toc);
      await toc.cert(tic); // Should be taken in 1 block
      await toc.cert(tac); // Should be taken in 1 other block
      await node3.commit({
        time: now + 200
      });
      await node3.commit({
        time: now + 200
      });
      await node3.commit({
        time: now + 200
      });
    });

    after(() => {
      return Promise.all([
        shutDownEngine(node3)
      ])
    })

    it('toc should give only 1 result with 3 certification by others', () => expectAnswer(rp('http://127.0.0.1:9997/wot/lookup/toc', { json: true }), function(res:HttpLookup) {
      should.exists(res);
      assert.equal(res.results.length, 1);
      assert.equal(res.results[0].uids[0].others.length, 3);
    }));

    it('tic should give only 1 results', () => expectAnswer(rp('http://127.0.0.1:9997/wot/lookup/tic', { json: true }), function(res:HttpLookup) {
      should.exists(res);
      const uids = Underscore.pluck(res.results[0].signed, 'uid');
      const uidsShould = ["cat", "tac", "toc"];
      uids.sort();
      uidsShould.sort();
      assert.deepEqual(uids, uidsShould);
      assert.equal(res.results.length, 1);
      assert.equal(res.results[0].signed.length, 3);
      const cat_signed = Underscore.findWhere(res.results[0].signed, { uid: 'cat'}) as HttpSigned
      const tac_signed = Underscore.findWhere(res.results[0].signed, { uid: 'tac'}) as HttpSigned
      const toc_signed = Underscore.findWhere(res.results[0].signed, { uid: 'toc'}) as HttpSigned
      assert.equal(cat_signed.uid, "cat");
      assert.equal(cat_signed.isMember, true);
      assert.equal(cat_signed.wasMember, true);
      assert.equal(tac_signed.uid, "tac");
      assert.equal(tac_signed.isMember, true);
      assert.equal(tac_signed.wasMember, true);
      assert.equal(toc_signed.uid, "toc");
      assert.equal(toc_signed.isMember, true);
      assert.equal(toc_signed.wasMember, true);
      assert.equal(res.results[0].uids[0].others.length, 3);
      assert.equal(res.results[0].uids[0].others[0].uids.length, 1);
      assert.equal(res.results[0].uids[0].others[0].isMember, true);
      assert.equal(res.results[0].uids[0].others[0].wasMember, true);
    }));

    it('it should exist block#2 with 4 members', () => expectAnswer(rp('http://127.0.0.1:9997/blockchain/block/2', { json: true }), function(block:HttpBlock) {
      should.exists(block);
      assert.equal(block.number, 2);
      assert.equal(block.membersCount, 4);
    }));

    blockShouldHaveCerts(0, 8);
    blockShouldHaveCerts(1, 0);
    blockShouldHaveCerts(2, 0);
    blockShouldHaveCerts(3, 1);
    blockShouldHaveCerts(4, 1);
    blockShouldHaveCerts(5, 0);

    function blockShouldHaveCerts(number:number, certificationsCount:number) {
      it('it should exist block#' + number + ' with ' + certificationsCount + ' certification', () => expectAnswer(rp('http://127.0.0.1:9997/blockchain/block/' + number, { json: true }), function(block:HttpBlock) {
        should.exists(block);
        assert.equal(block.number, number);
        assert.equal(block.certifications.length, certificationsCount);
      }));
    }
  });
});

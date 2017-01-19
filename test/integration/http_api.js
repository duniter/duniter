"use strict";

const co        = require('co');
const _         = require('underscore');
const should    = require('should');
const assert    = require('assert');
const duniter     = require('../../index');
const bma       = require('duniter-bma').duniter.methods.bma;
const user      = require('./tools/user');
const http      = require('./tools/http');
const constants = require('../../app/lib/constants');
const rp        = require('request-promise');
const ws        = require('ws');

const server = duniter(
  '/bb11',
  true,
  {
  ipv4: '127.0.0.1',
  port: '7777',
  currency: 'bb',
  httpLogs: true,
  sigQty: 1,
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
});

const cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: server });
const toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: server });

describe("HTTP API", function() {

  before(() => co(function*(){

    const commit = makeBlockAndPost(server);

    let s = yield server.initWithDAL();
    let bmapi = yield bma(s);
    yield bmapi.openConnections();
    yield cat.createIdentity();
    yield toc.createIdentity();
    yield toc.cert(cat);
    yield cat.cert(toc);
    yield cat.join();
    yield toc.join();
    yield commit();
    yield commit();
    yield commit();
    yield commit();
    yield commit();
  }));

  function makeBlockAndPost(theServer) {
    return function() {
      return require('duniter-prover').duniter.methods.generateAndProveTheNext(theServer)
        .then(postBlock(theServer));
    };
  }

  describe("/blockchain", function() {

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7777/blockchain/block/0', { json: true }), {
        number: 0
      });
    });

    it('/block/1 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7777/blockchain/block/1', { json: true }), {
        number: 1
      });
    });

    it('/block/88 should not exist', function() {
      return http.expectError(404, rp('http://127.0.0.1:7777/blockchain/block/88'));
    });

    it('/current should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7777/blockchain/current', { json: true }), {
        number: 4
      });
    });

    it('/membership should not accept wrong signature', function() {
      return http.expectError(400, 'wrong signature for membership', rp.post('http://127.0.0.1:7777/blockchain/membership', {
        json: {
          membership: 'Version: 10\n' +
          'Type: Membership\n' +
          'Currency: bb\n' +
          'Issuer: 6upqFiJ66WV6N3bPc8x8y7rXT3syqKRmwnVyunCtEj7o\n' +
          'Block: 0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855\n' +
          'Membership: IN\n' +
          'UserID: someuid\n' +
          'CertTS: 0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855\n' +
          'cJohoG/qmxm7KwqCB71RXRSIvHu7IcYB1zWE33OpPLGmedH mdPWad32S7G9j9IDpI8QpldalhdT4BUIHlAtCw==\n'
        }
      }));
    });

    it('/membership should not accept wrong signature 2', function() {
      return http.expectError(400, 'Document has unkown fields or wrong line ending format', rp.post('http://127.0.0.1:7777/blockchain/membership', {
        json: {
          membership: 'Version: 2\n' +
          'Type: Membership\n' +
          'Currency: bb\n' +
          'Issuer: 6upqFiJ66WV6N3bPc8x8y7rXT3syqKRmwnVyunCtEj7o\n' +
          'Block: 0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855\n' +
          'UserID: someuid\n' +
          'CertTS: 1421787800\n' +
          'cJohoG/qmxm7KwqCB71RXRSIvHu7IcYB1zWE33OpPLGmedH mdPWad32S7G9j9IDpI8QpldalhdT4BUIHlAtCw==\n'
        }
      }));
    });

    it('/membership should not accept wrong signature 3', function() {
      return http.expectError(400, 'Document has unkown fields or wrong line ending format', rp.post('http://127.0.0.1:7777/blockchain/membership', {
        json: {
          membership: 'Version: 2\n' +
          'Type: Membership\n' +
          'Currency: bb\n' +
          'Issuer: 6upqFiJ66WV6N3bPc8x8y7rXT3syqKRmwnVyunCtEj7o\n' +
          'Block: 0--E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855\n' +
          'Membership: IN\n' +
          'UserID: someuid\n' +
          'CertTS: 1421787800\n' +
          'cJohoG/qmxm7KwqCB71RXRSIvHu7IcYB1zWE33OpPLGmedH mdPWad32S7G9j9IDpI8QpldalhdT4BUIHlAtCw==\n'
        }
      }));
    });

    it('/difficulties should have current block number + 1', function() {
      return http.expectAnswer(rp('http://127.0.0.1:7777/blockchain/difficulties', { json: true }), function(res) {
        res.should.have.property('block').equal(5);
        res.should.have.property('levels').have.length(1);
      });
    });
  });

  describe("/ws", function() {

    it('/block should exist', function(done) {
      const client = new ws('ws://127.0.0.1:7777/ws/block');
      client.on('open', function open() {
        client.terminate();
        done();
      });
    });

    it('/block should send a block', function(done) {
      let completed = false
      const client = new ws('ws://127.0.0.1:7777/ws/block');
      client.on('message', function message(data) {
        const block = JSON.parse(data);
        should(block).have.property('number', 4);
        should(block).have.property('dividend', null);
        if (!completed) {
          completed = true;
          done();
        }
      });
    });

    it('/block should answer to pings', function(done) {
      const client = new ws('ws://127.0.0.1:7777/ws/block');
      client.on('pong', function message(data, flags) {
        client.terminate();
        done();
      });
      client.on('open', function open() {
        client.ping();
      });
    });
  });
});

function expectJSON(promise, json) {
  return co(function*(){
    try {
      const resJson = yield promise;
      _.keys(json).forEach(function(key){
        resJson.should.have.property(key).equal(json[key]);
      });
    } catch (err) {
      if (err.response) {
        assert.equal(err.response.statusCode, 200);
      }
      else throw err;
    }
  });
}

function postBlock(server2) {
  return function(block) {
    return post(server2, '/blockchain/block')({
      block: typeof block == 'string' ? block : block.getRawSigned()
    });
  };
}

function post(server2, uri) {
  return function(data) {
    return rp.post('http://' + [server2.conf.ipv4, server2.conf.port].join(':') + uri, {
      form: data
    });
  };
}

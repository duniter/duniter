"use strict";

var Q         = require('q');
var _         = require('underscore');
var should    = require('should');
var assert    = require('assert');
var ucoin     = require('./../../index');
var bma       = require('./../../app/lib/streams/bma');
var user      = require('./tools/user');
var constants = require('../../app/lib/constants');
var rp        = require('request-promise');

require('log4js').configure({
  "appenders": [
  ]
});

var server = ucoin({
  memory: true
}, {
  ipv4: '127.0.0.1',
  port: '7778',
  currency: 'bb',
  httpLogs: true,
  branchesWindowSize: 3,
  parcatipate: false, // TODO: to remove when startGeneration will be an explicit call
  sigQty: 1,
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
});

var cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: server });
var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: server });

var now = Math.round(new Date().getTime()/1000);

describe("Branches", function() {

  before(function() {

    var commit = makeBlockAndPost(server);

    return server.initWithServices().then(bma)

      .then(function(){
        return Q()
          .then(function() {
            return cat.selfCertPromise(now);
          })
          .then(function() {
            return toc.selfCertPromise(now);
          })
          .then(_.partial(toc.certPromise, cat))
          .then(_.partial(cat.certPromise, toc))
          .then(cat.joinPromise)
          .then(toc.joinPromise)
          .then(commit)
          .then(commit)
          .then(commit)
          .then(commit)
          .then(commit);
      })
      ;
  });

  function makeBlockAndPost(theServer) {
    return function() {
      return theServer.makeNextBlock()
        .then(postBlock(theServer));
    };
  }

  describe("/blockchain", function() {

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7778/blockchain/block/0', { json: true }), {
        number: 0
      });
    });

    it('/block/1 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7778/blockchain/block/1', { json: true }), {
        number: 1
      });
    });

    it('/block/88 should not exist', function() {
      return expectHttpCode(404, rp('http://127.0.0.1:7778/blockchain/block/88'));
    });

    it('/current should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7778/blockchain/current', { json: true }), {
        number: 4
      });
    });

    it('should have 1 branch', function() {
      return server.BlockchainService.branches()
        .then(function(branches){
          branches.should.have.length(1);
        });
    });
  });
});

function expectHttpCode(code, message, promise) {
  if (arguments.length == 2) {
    promise = arguments[1];
    message = undefined;
  }
  return promise
    .then(function(){
      assert.equal(200, code);
    })
    .catch(function(err){
      if (err.response) {
        assert.equal(err.response.statusCode, code);
        if (message) {
          assert.equal(err.error || err.cause, message);
        }
      }
      else throw err;
    });
}

function expectJSON(promise, json) {
  return promise
    .then(function(resJson){
      _.keys(json).forEach(function(key){
        resJson.should.have.property(key).equal(json[key]);
      });
    })
    .catch(function(err){
      if (err.response) {
        assert.equal(err.response.statusCode, 200);
      }
      else throw err;
    });
}

function postBlock(server) {
  return function(block) {
    return post(server, '/blockchain/block')({
      block: typeof block == 'string' ? block : block.getRawSigned()
    });
  };
}

function post(server, uri) {
  return function(data) {
    return rp.post('http://' + [server.conf.ipv4, server.conf.port].join(':') + uri, {
      form: data
    });
  };
}

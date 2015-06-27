"use strict";

var should = require('should');
var assert = require('assert');
var ucoin  = require('./../../index');
var bma    = require('./../../app/lib/streams/bma');
var rp     = require('request-promise');

require('log4js').configure({
  "appenders": [
  ]
});

var server = ucoin({
  memory: true
}, {
  ipv4: '127.0.0.1',
  port: '7777',
  currency: 'bb',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
});

describe("HTTP API", function() {

  before(function() {
    return server.initWithServices().then(bma);
  });

  describe("/blockchain", function() {

    it('/block/88 should not exist', function() {
      return expectHttpError(404, rp('http://127.0.0.1:7777/blockchain/block/88'));
    });

    it('/current should not exist', function() {
      return expectHttpError(404, rp('http://127.0.0.1:7777/blockchain/current'));
    });

    it('/membership should not accept wrong signature', function() {
      return expectHttpError(400, 'wrong signature for membership', rp.post('http://127.0.0.1:7777/blockchain/membership', {
        json: {
          membership: 'Version: 1\n' +
          'Type: Membership\n' +
          'Currency: bb\n' +
          'Issuer: 6upqFiJ66WV6N3bPc8x8y7rXT3syqKRmwnVyunCtEj7o\n' +
          'Block: 0-DA39A3EE5E6B4B0D3255BFEF95601890AFD80709\n' +
          'Membership: IN\n' +
          'UserID: someuid\n' +
          'CertTS: 1421787800\n' +
          'cJohoG/qmxm7KwqCB71RXRSIvHu7IcYB1zWE33OpPLGmedH mdPWad32S7G9j9IDpI8QpldalhdT4BUIHlAtCw==\n'
        }
      }));
    });

    it('/membership should not accept wrong signature', function() {
      return expectHttpError(400, 'Document has unkown fields or wrong line ending format', rp.post('http://127.0.0.1:7777/blockchain/membership', {
        json: {
          membership: 'Version: 1\n' +
          'Type: Membership\n' +
          'Currency: bb\n' +
          'Issuer: 6upqFiJ66WV6N3bPc8x8y7rXT3syqKRmwnVyunCtEj7o\n' +
          'Block: 0-DA39A3EE5E6B4B0D3255BFEF95601890AFD80709\n' +
          'UserID: someuid\n' +
          'CertTS: 1421787800\n' +
          'cJohoG/qmxm7KwqCB71RXRSIvHu7IcYB1zWE33OpPLGmedH mdPWad32S7G9j9IDpI8QpldalhdT4BUIHlAtCw==\n'
        }
      }));
    });

    it('/membership should not accept wrong signature', function() {
      return expectHttpError(400, 'Document has unkown fields or wrong line ending format', rp.post('http://127.0.0.1:7777/blockchain/membership', {
        json: {
          membership: 'Version: 1\n' +
          'Type: Membership\n' +
          'Currency: bb\n' +
          'Issuer: 6upqFiJ66WV6N3bPc8x8y7rXT3syqKRmwnVyunCtEj7o\n' +
          'Block: 0--DA39A3EE5E6B4B0D3255BFEF95601890AFD80709\n' +
          'Membership: IN\n' +
          'UserID: someuid\n' +
          'CertTS: 1421787800\n' +
          'cJohoG/qmxm7KwqCB71RXRSIvHu7IcYB1zWE33OpPLGmedH mdPWad32S7G9j9IDpI8QpldalhdT4BUIHlAtCw==\n'
        }
      }));
    });
  });
});

function expectHttpError(code, message, promise) {
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
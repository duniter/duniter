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
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
});

describe("HTTP API", function() {

  before(function() {
    return server.initWithServices().then(bma.bind(bma, server));
  });

  describe("/blockchain", function() {

    it('/block/88 should not exist', function() {
      return expectHttpError(404, rp('http://127.0.0.1:7777/blockchain/block/88'));
    });

    it('/current should not exist', function() {
      return expectHttpError(404, rp('http://127.0.0.1:7777/blockchain/current'));
    });
  });
});

function expectHttpError(code, promise) {
  return promise
    .then(function(){
      throw 'a ' + code + ' HTTP error was expected, but 200 was returned';
    })
    .catch(function(err){
      if (err.response) {
        if (err.response.statusCode != code) {
          throw 'a ' + code + ' HTTP error was expected, but ' + err.response.statusCode + ' was returned';
        }
      }
      else throw err;
    });
}
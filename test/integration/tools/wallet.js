"use strict";
var async		= require('async');
var request	= require('request');
var crypto	= require('../../../app/lib/crypto/duniterKey');
var rawer		= require('../../../app/lib/ucp/rawer');
var base58	= require('../../../app/lib/crypto/base58');

module.exports = function (salt, passwd, node) {
	return new Wallet(salt, passwd, node);
};

function Wallet (salt, passwd, node) {

  var that = this;
  var pub, sec;

  function init(done) {
    async.waterfall([
      function(next) {
        crypto.getKeyPair(salt, passwd, next);
      },
      function(pair, next) {
        pub = that.pub = base58.encode(pair.publicKey);
        sec = pair.secretKey;
        next();
      }
    ], done);
  }

  this.sendRaw = function (raw) {
    return function(done) {
      post('/tx/process', {
        "transaction": raw
      }, done);
    }
  };

  function post(uri, data, done) {
    var postReq = request.post({
      "uri": 'http://' + [node.server.conf.remoteipv4, node.server.conf.remoteport].join(':') + uri,
      "timeout": 1000*10
    }, function (err, res, body) {
      done(err, res, body);
    });
    postReq.form(data);
  }
}

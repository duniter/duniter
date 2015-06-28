"use strict";
var Q		    = require('q');
var async		= require('async');
var request	= require('request');
var vucoin	= require('vucoin');
var crypto	= require('../../../app/lib/crypto');
var rawer		= require('../../../app/lib/rawer');
var base58	= require('../../../app/lib/base58');

module.exports = function (uid, salt, passwd, url) {
	return new User(uid, salt, passwd, url);
};

function User (uid, options, node) {

  var that = this;
  var pub, sec;
  var selfCert = "";
  var selfTime = new Date();

  // For sync code
  if (options.pub && options.sec) {
    pub = that.pub = options.pub;
    sec = base58.decode(options.sec);
  }

  function init(done) {
    if (options.salt && options.passwd) {
      async.waterfall([
        function (next) {
          crypto.getKeyPair(options.salt, options.passwd, next);
        },
        function (pair, next) {
          pub = that.pub = base58.encode(pair.publicKey);
          sec = pair.secretKey;
          next();
        }
      ], done);
    } else if (options.pub && options.sec) {
      pub = that.pub = options.pub;
      sec = base58.decode(options.sec);
      done();
    } else {
      throw 'Not keypair information given for testing user ' + uid;
    }
  }

  this.selfCert = function (whenTimestamp) {
    return function(done) {
      var when = new Date();
      when.setTime(whenTimestamp*1000);
      selfTime = when;
      async.waterfall([
        function(next) {
          if (!pub) {
            init(next);
          }
          else next();
        },
        function(next) {
          selfCert = rawer.getSelfIdentity({ time: when, uid: uid });
          selfCert += crypto.signSync(selfCert, sec);
          post('/wot/add', {
            "pubkey": pub,
            "self": selfCert
          }, next);
        }
      ], function(err) {
        done(err);
      });
    };
  };

  this.selfCertPromise = function(whenTimestamp) {
    return Q.Promise(function(resolve, reject){
      that.selfCert(whenTimestamp)(function(err) {
        err ? reject(err) : resolve();
      });
    });
  };

  this.certPromise = function(user) {
    return Q.Promise(function(resolve, reject){
      that.cert(user)(function(err) {
        err ? reject(err) : resolve();
      });
    });
  };

  this.cert = function (user) {
    return function(done) {
      async.waterfall([
        function(next) {
          async.parallel({
            lookup: lookup(user.pub, function(res, callback) {
              callback(null, res);
            }),
            current: function(callback){
              node.server.BlockchainService.current(callback);
            }
          }, next);
        },
        function(res, next) {
          var current = res.current;
          var idty = res.lookup.results[0].uids[0];
          var when = new Date();
          var hisPub = res.lookup.results[0].pubkey;
          when.setTime(idty.meta.timestamp*1000);
          selfCert = rawer.getSelfIdentity({ time: when, uid: idty.uid });
          selfCert += idty.self;
          var blockNumber = (current ? current.number : 0);
          var cert = selfCert + '\nMETA:TS:' + (current ? [current.number, current.hash].join('-') : '0-DA39A3EE5E6B4B0D3255BFEF95601890AFD80709') + '\n';
          var sig = crypto.signSync(cert, sec);
          post('/wot/add', {
            "pubkey": hisPub,
            "self": selfCert,
            "other": [pub, hisPub, blockNumber, sig].join(':') + '\n'
          }, next);
        }
      ], function(err) {
        done(err);
      });
    }
  };

  this.join = function () {
    return that.sendMembership("IN");
  };

  this.joinPromise = function () {
    return that.sendMembershipPromise("IN");
  };

  this.leave = function () {
    return that.sendMembership("OUT");
  };

  this.sendMembershipPromise = function(type) {
    return Q.nfcall(that.sendMembership(type));
  };

  this.sendMembership = function (type) {
    return function(done) {
      async.waterfall([
        function(next) {
          async.parallel({
            current: function(callback){
              node.server.BlockchainService.current(callback);
            }
          }, next);
        },
        function(res, next) {
          var current = res.current;
          var block = (current ? [current.number, current.hash].join('-') : '0-DA39A3EE5E6B4B0D3255BFEF95601890AFD80709');
          var join = rawer.getMembershipWithoutSignature({
            "version": 1,
            "currency": node.server.conf.currency,
            "issuer": pub,
            "block": block,
            "membership": type,
            "userid": uid,
            "certts": selfTime
          });
          var sig = crypto.signSync(join, sec);
          post('/blockchain/membership', {
            "membership": join + sig + '\n'
          }, next);
        }
      ], function(err) {
        done(err);
      });
    }
  };

  this.send = function (amount, recipient, comment) {
    return function(done) {
      var sources = [];
      var choices = {};
      var currency = '';
      var raw = "";
      async.waterfall([
        function (next) {
          if (!amount || !recipient) {
            next('Amount and recipient are required');
            return;
          }
          getVucoin()
            .then(function(http){
              http.tx.sources(pub, next);
            })
            .fail(next);
        },
        function (json, next) {
          currency = json.currency;
          var i = 0;
          var cumulated = 0;
          while (i < json.sources.length) {
            var src = json.sources[i];
            sources.push({
              'type': src.type,
              'amount': src.amount,
              'number': src.number,
              'hash': src.fingerprint
            });
            cumulated += src.amount;
            i++;
          }
          if (cumulated < amount) {
            next('You do not have enough coins! (' + cumulated + ' ' + currency + ' left)');
          }
          else {
            next();
          }
        },
        function (next) {
          var selected = [];
          var total = 0;
          for (var i = 0; i < sources.length && total < amount; i++) {
            var src = sources[i];
            total += src.amount;
            selected.push(src);
          }
          next(null, selected);
        },
        function (sources, next) {
          var inputSum = 0;
          var issuer = pub;
          raw += "Version: 1" + '\n';
          raw += "Type: Transaction\n";
          raw += "Currency: " + currency + '\n';
          raw += "Issuers:\n";
          raw += issuer + '\n';
          raw += "Inputs:\n";
          sources.forEach(function (src) {
            raw += ['0', src.type, src.number, src.hash, src.amount].join(':') + '\n';
            inputSum += src.amount;
          });
          raw += "Outputs:\n";
          raw += [recipient.pub, amount].join(':') + '\n';
          if (inputSum - amount > 0) {
            // Rest back to issuer
            raw += [issuer, inputSum - amount].join(':') + '\n';
          }
          raw += "Comment: " + (comment || "") + "\n";
          next(null, raw);
        },
        function (raw, next) {
          var sig = crypto.signSync(raw, sec);
          raw += sig + '\n';

          getVucoin()
            .then(function(http){
              http.tx.process(raw, function (err) {
                if (err) console.error('Error:', err);
                next(err);
              })
            })
            .fail(next);
        }
      ], done);
    }
  };

  function post(uri, data, done) {
    var postReq = request.post({
      "uri": 'http://' + [node.server.conf.remoteipv4, node.server.conf.remoteport].join(':') + uri,
      "timeout": 1000*10
    }, function (err, res, body) {
      err = err || (res.statusCode != 200 && body != 'Already up-to-date' && body) || null;
      done(err, res, body);
    });
    postReq.form(data);
  }

  function getVucoin() {
    return Q.nfcall(vucoin, node.server.conf.ipv4, node.server.conf.port);
  }

  function lookup(pubkey, done) {
    return function(calback) {
      getVucoin()
        .then(function(node){
          node.wot.lookup(pubkey, function(err, res) {
            done(res, calback);
          });
        })
        .fail(done);
    };
  }
}

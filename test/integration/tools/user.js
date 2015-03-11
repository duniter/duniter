var async		= require('async');
var request	= require('request');
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
    }
  };

  this.cert = function (user) {
    return function(done) {
      async.waterfall([
        function(next) {
          async.parallel({
            lookup: node.lookup(user.pub, function(res, callback) {
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

  this.leave = function () {
    return that.sendMembership("OUT");
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

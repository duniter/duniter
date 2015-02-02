var async		= require('async');
var request	= require('request');
var crypto	= require('../../../app/lib/crypto');
var rawer		= require('../../../app/lib/rawer');
var base58	= require('../../../app/lib/base58');

module.exports = function (uid, salt, passwd, url) {
	return new User(uid, salt, passwd, url);
};

function User (uid, salt, passwd, node) {

  var that = this;
  var pub, sec;
  var selfCert = "";

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

  this.selfCert = function (whenTimestamp) {
    return function(done) {
      var when = new Date();
      when.setTime(whenTimestamp*1000);
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

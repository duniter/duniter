"use strict";
var co      = require('co');
var Q		    = require('q');
var async		= require('async');
var request	= require('request');
var vucoin	= require('vucoin');
var ucp     = require('../../../app/lib/ucp');
var parsers = require('../../../app/lib/streams/parsers/doc');
var crypto	= require('../../../app/lib/crypto');
var rawer		= require('../../../app/lib/rawer');
var base58	= require('../../../app/lib/base58');
var constants = require('../../../app/lib/constants');
var Identity = require('../../../app/lib/entity/identity');

module.exports = function (uid, salt, passwd, url) {
  return new User(uid, salt, passwd, url);
};

function User (uid, options, node) {

  var that = this;
  var pub, sec;
  var selfCert = "";

  // For sync code
  if (options.pub && options.sec) {
    pub = that.pub = options.pub;
    sec = that.sec = base58.decode(options.sec);
  }

  function init(done) {
    if (options.salt && options.passwd) {
      async.waterfall([
        function (next) {
          crypto.getKeyPair(options.salt, options.passwd, next);
        },
        function (pair, next) {
          pub = that.pub = base58.encode(pair.publicKey);
          sec = that.sec = pair.secretKey;
          next();
        }
      ], done);
    } else if (options.pub && options.sec) {
      pub = that.pub = options.pub;
      sec = that.sec = base58.decode(options.sec);
      done();
    } else {
      throw 'Not keypair information given for testing user ' + uid;
    }
  }

  this.selfCert = function (useRoot) {
    return function(done) {
      async.waterfall([
        function(next) {
          if (!pub) {
            init(next);
          }
          else next();
        },
        function(next) {
          node.server.BlockchainService.current(next);
        },
        function(current, next) {
          let buid = !useRoot && current ? ucp.format.buid(current.number, current.hash) : '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855';
          selfCert = rawer.getOfficialIdentity({
            buid: buid,
            uid: uid,
            issuer: pub,
            currency: node.server.conf.currency
          });
          selfCert += crypto.signSync(selfCert, sec);
          post('/wot/add', {
            "identity": selfCert
          }, next);
        }
      ], function(err) {
        done(err);
      });
    };
  };

  this.selfCertPromise = function(useRoot) {
    return Q.Promise(function(resolve, reject){
      that.selfCert(useRoot)(function(err) {
        err ? reject(err) : resolve();
      });
    });
  };

  this.certPromise = function(user, fromServer) {
    return Q.Promise(function(resolve, reject){
      that.cert(user, fromServer)(function(err) {
        err ? reject(err) : resolve();
      });
    });
  };

  this.cert = function (user, fromServer) {
    return function(done) {
      async.waterfall([
        function(next) {
          async.parallel({
            lookup: lookup(user.pub, fromServer, function(res, callback) {
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
          let buid = current ? ucp.format.buid(current.number, current.hash) : ucp.format.buid();
          var cert = rawer.getOfficialCertification({
            "version": constants.DOCUMENTS_VERSION,
            "currency": node.server.conf.currency,
            "issuer": pub,
            "idty_issuer": user.pub,
            "idty_uid": idty.uid,
            "idty_buid": idty.meta.timestamp,
            "idty_sig": idty.self,
            "buid": buid
          });
          var sig = crypto.signSync(cert, sec);
          post('/wot/certify', {
            "cert": cert + sig
          }, next);
        }
      ], function(err) {
        done(err);
      });
    };
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

  this.revoke = () => co(function *() {
    let res = yield lookupP(pub);
    let idty = Identity.statics.fromJSON({
      uid: res.results[0].uids[0].uid,
      buid: res.results[0].uids[0].meta.timestamp,
      sig: res.results[0].uids[0].self
    });

    var revocation = rawer.getOfficialRevocation({
      "currency": node.server.conf.currency,
      "issuer": pub,
      "uid": idty.uid,
      "sig": idty.sig,
      "buid": idty.buid,
      "revocation": ''
    });

    var sig = crypto.signSync(revocation, sec);
    return Q.nfcall(post, '/wot/revoke', {
      "revocation": revocation + sig
    });
  });

  this.sendMembershipPromise = function(type) {
    return Q.nfcall(that.sendMembership(type));
  };

  this.sendMembership = function (type) {
    return function(done) {
      async.waterfall([
        function(next) {
          async.parallel({
            lookup: lookup(pub, null, function(res, callback) {
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
          var block = ucp.format.buid(current);
          var join = rawer.getMembershipWithoutSignature({
            "version": constants.DOCUMENTS_VERSION,
            "currency": node.server.conf.currency,
            "issuer": pub,
            "block": block,
            "membership": type,
            "userid": uid,
            "certts": idty.meta.timestamp
          });
          var sig = crypto.signSync(join, sec);
          post('/blockchain/membership', {
            "membership": join + sig + '\n'
          }, next);
        }
      ], function(err) {
        done(err);
      });
    };
  };

  this.send = function (amount, recipient, comment) {
    return function(done) {
      return co(function *() {
        let raw = yield that.prepareITX(amount, recipient, comment);
        return that.sendTX(raw);
      })
        .then(() => done()).catch(done);
    };
  };

  this.sendTX = (rawTX) => co(function *() {
    let http = yield getVucoin();
    return Q.nbind(http.tx.process, http)(rawTX);
  });

  this.prepareUTX = (previousTX, unlocks, outputs, opts) => co(function *() {
    let obj = parsers.parseTransaction.syncWrite(previousTX);
    // Unlocks inputs with given "unlocks" strings
    let inputs = obj.outputs.map((out, index) => {
      return {
        src: ['T', obj.hash, index].join(':'),
        unlock: unlocks[index]
      };
    });
    return signed(that.prepareTX(inputs, outputs, opts));
  });

  this.prepareMTX = (previousTX, user2, unlocks, outputs, opts) => co(function *() {
    let obj = parsers.parseTransaction.syncWrite(previousTX);
    // Unlocks inputs with given "unlocks" strings
    let inputs = obj.outputs.map((out, index) => {
      return {
        src: ['T', obj.hash, index].join(':'),
        unlock: unlocks[index]
      };
    });
    opts = opts || {};
    opts.issuers = [pub, user2.pub];
    return signed(that.prepareTX(inputs, outputs, opts), user2);
  });

  this.prepareOTX = (previousTX, outputs, opts) => co(function *() {

  });

  this.prepareITX = (amount, recipient, comment) => co(function *() {
    let sources = [];
    if (!amount || !recipient) {
      throw 'Amount and recipient are required';
    }
    let http = yield getVucoin();
    let json = yield Q.nbind(http.tx.sources, http)(pub);
    let i = 0;
    let cumulated = 0;
    while (i < json.sources.length) {
      let src = json.sources[i];
      sources.push({
        'type': src.type,
        'amount': src.amount,
        'noffset': src.noffset,
        'identifier': src.identifier
      });
      cumulated += src.amount;
      i++;
    }
    if (cumulated < amount) {
      throw 'You do not have enough coins! (' + cumulated + ' ' + node.server.conf.currency + ' left)';
    }
    let sources2 = [];
    let total = 0;
    for (let j = 0; j < sources.length && total < amount; j++) {
      var src = sources[j];
      total += src.amount;
      sources2.push(src);
    }
    var inputSum = 0;
    sources2.forEach((src) => inputSum += src.amount);
    let inputs = sources2.map((src) => {
      return {
        src: [src.type, src.identifier, src.noffset].join(':'),
        unlock: 'SIG(0)'
      };
    });
    let outputs = [{
      qty: amount,
      lock: 'SIG(' + recipient.pub + ')'
    }];
    if (inputSum - amount > 0) {
      // Rest back to issuer
      outputs.push({
        qty: inputSum - amount,
        lock: "SIG(" + pub + ")"
      });
    }
    return signed(that.prepareTX(inputs, outputs, {
      comment: comment
    }));
  });

  function signed(raw, user2) {
    let signatures = [crypto.signSync(raw, sec)];
    if (user2) {
      signatures.push(crypto.signSync(raw, user2.sec));
    }
    return raw + signatures.join('\n') + '\n';
  }

  this.prepareTX = (inputs, outputs, theOptions) => {
    let opts = theOptions || {};
    let issuers = opts.issuers || [pub];
    let raw = '';
    raw += "Version: " + constants.DOCUMENTS_VERSION + '\n';
    raw += "Type: Transaction\n";
    raw += "Currency: " + node.server.conf.currency + '\n';
    raw += "Locktime: " + (theOptions.locktime || 0) + '\n';
    raw += "Issuers:\n";
    issuers.forEach((issuer) => raw += issuer + '\n');
    raw += "Inputs:\n";
    inputs.forEach(function (input) {
      raw += input.src + '\n';
    });
    raw += "Unlocks:\n";
    inputs.forEach(function (input, index) {
      if (input.unlock) {
        raw += index + ":" + input.unlock + '\n';
      }
    });
    raw += "Outputs:\n";
    outputs.forEach(function (output) {
      raw += [output.qty, output.lock].join(':') + '\n';
    });
    raw += "Comment: " + (opts.comment || "") + "\n";
    return raw;
  };

  function post(uri, data, done) {
    var postReq = request.post({
      "uri": 'http://' + [node.server.conf.remoteipv4, node.server.conf.remoteport].join(':') + uri,
      "timeout": 1000 * 100000
    }, function (err, res, body) {
      err = err || (res.statusCode != 200 && body != 'Already up-to-date' && body) || null;
      done(err, res, body);
    });
    postReq.form(data);
  }

  function getVucoin(fromServer) {
    return Q.Promise(function(resolve, reject){
      let theNode = (fromServer && { server: fromServer }) || node;
      vucoin(theNode.server.conf.ipv4, theNode.server.conf.port, function(err, node2) {
        if (err) return reject(err);
        resolve(node2);
      }, {
        timeout: 1000 * 100000
      });
    });
  }

  function lookup(pubkey, fromServer, done) {
    return function(calback) {
      getVucoin(fromServer)
        .then(function(node2){
          node2.wot.lookup(pubkey, function(err, res) {
            if (err) {
              console.error(err);
            }
            done(res, calback);
          });
        })
        .catch(done);
    };
  }

  function lookupP(pubkey) {
    return co(function *() {
      let node2 = yield getVucoin();
      return Q.nbind(node2.wot.lookup, node2)(pubkey);
    });
  }

  this.selfCertP = (when) => Q.nfcall(this.selfCert(when));
  this.certP = (user) => Q.nfcall(this.cert(user));
  this.joinP = () => Q.nfcall(this.join());
  this.leaveP = () => Q.nfcall(this.leave());
  this.sendP = (amount, userid, comment) => Q.nfcall(this.send.apply(this, [amount, userid, comment]));
}

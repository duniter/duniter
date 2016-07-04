"use strict";
var co      = require('co');
var Q		    = require('q');
var async		= require('async');
var request	= require('request');
var vucoin	= require('vucoin');
var ucp     = require('../../../app/lib/ucp/buid');
var parsers = require('../../../app/lib/streams/parsers');
var keyring	= require('../../../app/lib/crypto/keyring');
var rawer		= require('../../../app/lib/ucp/rawer');
var base58	= require('../../../app/lib/crypto/base58');
var constants = require('../../../app/lib/constants');
var Identity = require('../../../app/lib/entity/identity');

module.exports = function (uid, salt, passwd, url) {
  return new User(uid, salt, passwd, url);
};

function User (uid, options, node) {

  var that = this;
  var pub, sec;
  var selfCert = "";
  that.node = node;

  // For sync code
  if (options.pub && options.sec) {
    pub = that.pub = options.pub;
    sec = that.sec = options.sec;
  }

  function init(done) {
    if (options.salt && options.passwd) {
      async.waterfall([
        function (next) {
          keyring.scryptKeyPair(options.salt, options.passwd).then((pair) => next(null, pair)).catch(next);
        },
        function (pair, next) {
          pub = that.pub = pair.publicKey;
          sec = that.sec = pair.secretKey;
          next();
        }
      ], done);
    } else if (options.pub && options.sec) {
      pub = that.pub = options.pub;
      sec = that.sec = options.sec;
      done();
    } else {
      throw 'Not keypair information given for testing user ' + uid;
    }
  }

  this.selfCert = (useRoot) => co(function*() {
    if (!pub)
      yield Q.nfcall(init);
    const current = yield node.server.BlockchainService.current();
    let buid = !useRoot && current ? ucp.format.buid(current.number, current.hash) : '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855';
    selfCert = rawer.getOfficialIdentity({
      buid: buid,
      uid: uid,
      issuer: pub,
      currency: node.server.conf.currency
    });
    selfCert += keyring.Key(pub, sec).signSync(selfCert) + '\n';
    yield Q.nfcall(post, '/wot/add', {
      "identity": selfCert
    });
  });

  this.cert = (user, fromServer) => co(function*() {
    const lookup = yield that.lookup(user.pub, fromServer);
    const current = yield node.server.BlockchainService.current();
    const idty = lookup.results[0].uids[0];
    let buid = current ? ucp.format.buid(current.number, current.hash) : ucp.format.buid();
    const cert = rawer.getOfficialCertification({
      "version": constants.DOCUMENTS_VERSION,
      "currency": node.server.conf.currency,
      "issuer": pub,
      "idty_issuer": user.pub,
      "idty_uid": idty.uid,
      "idty_buid": idty.meta.timestamp,
      "idty_sig": idty.self,
      "buid": buid
    });
    const sig = keyring.Key(pub, sec).signSync(cert, sec);
    yield Q.nfcall(post, '/wot/certify', {
      "cert": cert + sig + "\n"
    });
  });

  this.join = () => co(function*() {
    return yield that.sendMembership("IN");
  });

  this.leave = () => co(function*() {
    return yield that.sendMembership("OUT");
  });

  this.revoke = () => co(function *() {
    let res = yield that.lookup(pub);
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

    var sig = keyring.Key(pub, sec).signSync(revocation);
    return Q.nfcall(post, '/wot/revoke', {
      "revocation": revocation + sig + '\n'
    });
  });

  this.sendMembership = (type) => co(function*() {
    const lookup = yield that.lookup(pub, null);
    const current = yield node.server.BlockchainService.current();
    const idty = lookup.results[0].uids[0];
    const block = ucp.format.buid(current);
    const join = rawer.getMembershipWithoutSignature({
        "version": constants.DOCUMENTS_VERSION,
        "currency": node.server.conf.currency,
        "issuer": pub,
        "block": block,
        "membership": type,
        "userid": uid,
        "certts": idty.meta.timestamp
      });
    const sig = keyring.Key(pub, sec).signSync(join);
    yield Q.nfcall(post, '/blockchain/membership', {
      "membership": join + sig + '\n'
    });
  });

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

  this.prepareITX = (amount, recipient, comment) => co(function *() {
    let sources = [];
    if (!amount || !recipient) {
      throw 'Amount and recipient are required';
    }
    let http = yield getVucoin();
    let json = yield Q.nbind(http.tx.sources, http)(pub);
    let i = 0;
    let cumulated = 0;
    let commonbase = null;
    while (i < json.sources.length) {
      let src = json.sources[i];
      sources.push({
        'type': src.type,
        'amount': src.amount,
        'base': src.base,
        'noffset': src.noffset,
        'identifier': src.identifier
      });
      if (commonbase == null) {
        commonbase = src.base;
      }
      commonbase = Math.min(commonbase, src.base);
      cumulated += src.amount * Math.pow(10, src.base);
      i++;
    }
    if (cumulated < amount) {
      throw 'You do not have enough coins! (' + cumulated + ' ' + node.server.conf.currency + ' left)';
    }
    let sources2 = [];
    let total = 0;
    for (let j = 0; j < sources.length && total < amount; j++) {
      var src = sources[j];
      total += src.amount * Math.pow(10, src.base);
      sources2.push(src);
    }
    var inputSum = 0;
    sources2.forEach((src) => inputSum += src.amount * Math.pow(10, src.base));
    let inputs = sources2.map((src) => {
      return {
        src: [src.type, src.identifier, src.noffset].join(':'),
        unlock: 'SIG(0)'
      };
    });
    let outputs = [{
      qty: amount,
      base: commonbase,
      lock: 'SIG(' + recipient.pub + ')'
    }];
    if (inputSum - amount > 0) {
      // Rest back to issuer
      outputs.push({
        qty: inputSum - amount,
        base: commonbase,
        lock: "SIG(" + pub + ")"
      });
    }
    return signed(that.prepareTX(inputs, outputs, {
      comment: comment
    }));
  });

  function signed(raw, user2) {
    let signatures = [keyring.Key(pub, sec).signSync(raw)];
    if (user2) {
      signatures.push(keyring.Key(user2.pub, user2.sec).signSync(raw));
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
      raw += [output.qty, output.base, output.lock].join(':') + '\n';
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

  this.lookup = (pubkey, fromServer) => co(function*() {
    const node2 = yield getVucoin(fromServer);
    return yield Q.nbind(node2.wot.lookup, node2.wot, pubkey);
  });

  this.sendP = (amount, userid, comment) => Q.nfcall(this.send.apply(this, [amount, userid, comment]));
}

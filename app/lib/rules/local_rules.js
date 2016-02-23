"use strict";

var co         = require('co');
var hashf      = require('./../hashf');
var crypto     = require('./../crypto');
var rawer      = require('./../rawer');
var Identity   = require('../entity/identity');
var Membership = require('../entity/membership');

let rules = {};

rules.FUNCTIONS = {

  checkParameters: (block) => co(function *() {
    if (block.number == 0 && !block.parameters) {
      throw Error('Parameters must be provided for root block');
    }
    else if (block.number > 0 && block.parameters) {
      throw Error('Parameters must not be provided for non-root block');
    }
    return true;
  }),

  checkProofOfWork: (block) => co(function *() {
    var powRegexp = new RegExp('^0{' + Math.floor(block.powMin / 4) + '}');
    if (!block.hash.match(powRegexp)) {
      throw Error('Not a proof-of-work');
    }
    return true;
  }),

  checkInnerHash: (block) => co(function *() {
    let inner_hash = hashf(block.getRawInnerPart()).toUpperCase();
    if (block.inner_hash != inner_hash) {
      throw Error('Wrong inner hash');
    }
    return true;
  }),

  checkPreviousHash: (block) => co(function *() {
    if (block.number == 0 && block.previousHash) {
      throw Error('PreviousHash must not be provided for root block');
    }
    else if (block.number > 0 && !block.previousHash) {
      throw Error('PreviousHash must be provided for non-root block');
    }
    return true;
  }),

  checkPreviousIssuer: (block) => co(function *() {
    if (block.number == 0 && block.previousIssuer)
      throw Error('PreviousIssuer must not be provided for root block');
    else if (block.number > 0 && !block.previousIssuer)
      throw Error('PreviousIssuer must be provided for non-root block');
    return true;
  }),

  checkUnitBase: (block) => co(function *() {
    if (block.dividend > 0 && !(block.unitbase === 0 || block.unitbase > 0))
      throw Error('UnitBase must be provided for UD block');
    return true;
  }),

  checkBlockSignature: (block) => co(function *() {
    if (!crypto.verify(block.getSignedPart(), block.signature, block.issuer))
      throw Error('Block\'s signature must match');
    return true;
  }),

  checkBlockTimes: (block, conf) => co(function *() {
    var time = parseInt(block.time);
    var medianTime = parseInt(block.medianTime);
    if (block.number > 0 && (time < medianTime || time > medianTime + maxAcceleration(conf)))
      throw Error('A block must have its Time between MedianTime and MedianTime + ' + maxAcceleration(conf));
    else if (block.number == 0 && time != medianTime)
      throw Error('Root block must have Time equal MedianTime');
    return true;
  }),

  checkIdentitiesSignature: (block) => co(function *() {
    var i = 0;
    var wrongSig = false;
    while (!wrongSig && i < block.identities.length) {
      var idty = Identity.statics.fromInline(block.identities[i]);
      idty.currency = block.currency;
      wrongSig = !crypto.verify(idty.rawWithoutSig(), idty.sig, idty.pubkey);
      if (wrongSig) {
        throw Error('Identity\'s signature must match');
      }
      i++;
    }
    return true;
  }),

  checkIdentitiesUserIDConflict: (block) => co(function *() {
    var uids = [];
    var i = 0;
    var conflict = false;
    while (!conflict && i < block.identities.length) {
      var uid = block.identities[i].split(':')[3];
      conflict = ~uids.indexOf(uid);
      uids.push(uid);
      i++;
    }
    if (conflict) {
      throw Error('Block must not contain twice same identity uid');
    }
    return true;
  }),

  checkIdentitiesPubkeyConflict: (block) => co(function *() {
    var pubkeys = [];
    var i = 0;
    var conflict = false;
    while (!conflict && i < block.identities.length) {
      var pubk = block.identities[i].split(':')[0];
      conflict = ~pubkeys.indexOf(pubk);
      pubkeys.push(pubk);
      i++;
    }
    if (conflict) {
      throw Error('Block must not contain twice same identity pubkey');
    }
    return true;
  }),

  checkIdentitiesMatchJoin: (block) => co(function *() {
    // N.B.: this function does not test for potential duplicates in
    // identities and/or joiners, this is another test responsibility
    var pubkeys = [];
    block.identities.forEach(function(inline){
      let sp = inline.split(':');
      let pubk = sp[0], ts = sp[2], uid = sp[3];
      pubkeys.push([pubk, uid, ts].join('-'));
    });
    var matchCount = 0;
    var i = 0;
    while (i < block.joiners.length) {
      let sp = block.joiners[i].split(':');
      let pubk = sp[0], ts = sp[3], uid = sp[4];
      let idty = [pubk, uid, ts].join('-');
      if (~pubkeys.indexOf(idty)) matchCount++;
      i++;
    }
    let problem = matchCount != pubkeys.length;
    if (problem) {
      throw Error('Each identity must match a newcomer line with same userid and certts');
    }
    return true;
  }),

  checkRevokedAreExcluded: (block) => co(function *() {
    // N.B.: this function does not test for potential duplicates in Revoked,
    // this is another test responsability
    var pubkeys = [];
    block.revoked.forEach(function(inline){
      let sp = inline.split(':');
      let pubk = sp[0];
      pubkeys.push(pubk);
    });
    var matchCount = 0;
    var i = 0;
    while (i < block.excluded.length) {
      if (~pubkeys.indexOf(block.excluded[i])) matchCount++;
      i++;
    }
    let problem = matchCount != pubkeys.length;
    if (problem) {
      throw Error('A revoked member must be excluded');
    }
    return true;
  }),

  checkRevokedUnicity: (block) => co(function *() {
    let pubkeys = [];
    let conflict = false;
    let i = 0;
    while (!conflict && i < block.revoked.length) {
      let pubk = block.revoked[i].split(':')[0];
      conflict = ~pubkeys.indexOf(pubk);
      pubkeys.push(pubk);
      i++;
    }
    if (conflict) {
      throw Error('A single revocation per member is allowed');
    }
    return true;
  }),

  checkRevokedNotInMemberships: (block) => co(function *() {
    var i = 0;
    var conflict = false;
    while (!conflict && i < block.revoked.length) {
      let pubk = block.revoked[i].split(':')[0];
      conflict = existsPubkeyIn(pubk, block.joiners)
        || existsPubkeyIn(pubk, block.actives)
        || existsPubkeyIn(pubk, block.leavers);
      i++;
    }
    if (conflict) {
      throw Error('A revoked pubkey cannot have a membership in the same block');
    }
    return true;
  }),

  checkMembershipsSignature: (block) => co(function *() {
    var i = 0;
    var wrongSig = false, ms;
    // Joiners
    while (!wrongSig && i < block.joiners.length) {
      ms = Membership.statics.fromInline(block.joiners[i], 'IN', block.currency);
      wrongSig = !checkSingleMembershipSignature(ms);
      i++;
    }
    // Actives
    i = 0;
    while (!wrongSig && i < block.actives.length) {
      ms = Membership.statics.fromInline(block.actives[i], 'IN', block.currency);
      wrongSig = !checkSingleMembershipSignature(ms);
      i++;
    }
    // Leavers
    i = 0;
    while (!wrongSig && i < block.leavers.length) {
      ms = Membership.statics.fromInline(block.leavers[i], 'OUT', block.currency);
      wrongSig = !checkSingleMembershipSignature(ms);
      i++;
    }
    if (wrongSig) {
      throw Error('Membership\'s signature must match');
    }
    return true;
  }),

  checkPubkeyUnicity: (block) => co(function *() {
    var pubkeys = [];
    var conflict = false;
    var pubk;
    // Joiners
    var i = 0;
    while (!conflict && i < block.joiners.length) {
      pubk = block.joiners[i].split(':')[0];
      conflict = ~pubkeys.indexOf(pubk);
      pubkeys.push(pubk);
      i++;
    }
    // Actives
    i = 0;
    while (!conflict && i < block.actives.length) {
      pubk = block.actives[i].split(':')[0];
      conflict = ~pubkeys.indexOf(pubk);
      pubkeys.push(pubk);
      i++;
    }
    // Leavers
    i = 0;
    while (!conflict && i < block.leavers.length) {
      pubk = block.leavers[i].split(':')[0];
      conflict = ~pubkeys.indexOf(pubk);
      pubkeys.push(pubk);
      i++;
    }
    // Excluded
    i = 0;
    while (!conflict && i < block.excluded.length) {
      pubk = block.excluded[i].split(':')[0];
      conflict = ~pubkeys.indexOf(pubk);
      pubkeys.push(pubk);
      i++;
    }
    if (conflict) {
      throw Error('Block cannot contain a same pubkey more than once in joiners, actives, leavers and excluded');
    }
    return true;
  }),

  checkCertificationOneByIssuer: (block) => co(function *() {
    var conflict = false;
    if (block.number > 0) {
      var issuers = [];
      var i = 0;
      while (!conflict && i < block.certifications.length) {
        var issuer = block.certifications[i].split(':')[0];
        conflict = ~issuers.indexOf(issuer);
        issuers.push(issuer);
        i++;
      }
    }
    if (conflict) {
      throw Error('Block cannot contain two certifications from same issuer');
    }
    return true;
  }),

  checkCertificationUnicity: (block) => co(function *() {
    var certs = [];
    var i = 0;
    var conflict = false;
    while (!conflict && i < block.certifications.length) {
      var cert = block.certifications[i].split(':').slice(0,2).join(':');
      conflict = ~certs.indexOf(cert);
      certs.push(cert);
      i++;
    }
    if (conflict) {
      throw Error('Block cannot contain identical certifications (A -> B)');
    }
    return true;
  }),

  checkCertificationIsntForLeaverOrExcluded: (block) => co(function *() {
    var pubkeys = [];
    block.leavers.forEach(function(leaver){
      var pubk = leaver.split(':')[0];
      pubkeys.push(pubk);
    });
    block.excluded.forEach(function(excluded){
      pubkeys.push(excluded);
    });
    // Certifications
    var conflict = false;
    var i = 0;
    while (!conflict && i < block.certifications.length) {
      var sp = block.certifications[i].split(':');
      var pubkFrom = sp[0], pubkTo = sp[1];
      conflict = ~pubkeys.indexOf(pubkFrom) || ~pubkeys.indexOf(pubkTo);
      i++;
    }
    if (conflict) {
      throw Error('Block cannot contain certifications concerning leavers or excluded members');
    }
    return true;
  }),

  checkTxIssuers: (block) => co(function *() {
    var txs = block.getTransactions();
    // Check rule against each transaction
    for (let i = 0, len = txs.length; i < len; i++) {
      let tx = txs[i];
      if (tx.issuers.length == 0) {
        throw Error('A transaction must have at least 1 issuer');
      }
    }
    return true;
  }),

  checkTxSources: (block) => co(function *() {
    var txs = block.getTransactions();
    var sources = [];
    var i = 0;
    var existsIdenticalSource = false;
    while (!existsIdenticalSource && i < txs.length) {
      var tx = txs[i];
      if (!tx.inputs || tx.inputs.length == 0) {
        throw Error('A transaction must have at least 1 source');
      }
      tx.inputs.forEach(function (input) {
        if (~sources.indexOf(input.raw)) {
          existsIdenticalSource = true;
        } else {
          sources.push(input.raw);
        }
      });
      i++;
    }
    if (existsIdenticalSource) {
      throw Error('It cannot exist 2 identical sources for transactions inside a given block');
    }
    return true;
  }),

  checkTxRecipients: (block) => co(function *() {
    var txs = block.getTransactions();
    // Check rule against each transaction
    for (let i = 0, len = txs.length; i < len; i++) {
      let tx = txs[i];
      if (!tx.outputs || tx.outputs.length == 0) {
        throw Error('A transaction must have at least 1 recipient');
      }
      else {
        // Cannot have 2 identical pubkeys in outputs
        var existsIdenticalRecipient = false;
        var recipients = [];
        tx.outputs.forEach(function (output) {
          if (~recipients.indexOf(output.raw)) {
            existsIdenticalRecipient = true;
          } else {
            recipients.push(output.raw);
          }
        });
        if (existsIdenticalRecipient) {
          throw Error('It cannot exist 2 identical recipients inside a transaction');
        }
      }
    }
    return true;
  }),

  checkTxSignature: (block) => co(function *() {
    var txs = block.getTransactions();
    // Check rule against each transaction
    for (let i = 0, len = txs.length; i < len; i++) {
      let tx = txs[i];
      let sigResult = getSigResult(tx);
      if (!sigResult.matching) {
        throw Error('Signature from a transaction must match');
      }
    }
    return true;
  })
};

function maxAcceleration (conf) {
  return Math.ceil(conf.avgGenTime * Math.sqrt(2)) * (Math.ceil((conf.medianTimeBlocks + 1) / 2) + 1);
}

function existsPubkeyIn(pubk, memberships) {
  let i = 0;
  let conflict = false;
  while (!conflict && i < memberships.length) {
    let pubk2 = memberships[i].split(':')[0];
    conflict = pubk == pubk2;
    i++;
  }
  return conflict;
}

function checkSingleMembershipSignature(ms) {
  return crypto.verify(ms.getRaw(), ms.signature, ms.issuer);
}

function getSigResult(tx) {
  let sigResult = { sigs: {}, matching: true };
  let json = { "version": tx.version, "currency": tx.currency, "locktime": tx.locktime, "inputs": [], "outputs": [], "issuers": tx.issuers, "signatures": [], "comment": tx.comment };
  tx.inputs.forEach(function (input) {
    json.inputs.push(input.raw);
  });
  tx.outputs.forEach(function (output) {
    json.outputs.push(output.raw);
  });
  json.unlocks = tx.unlocks;
  var i = 0;
  var signaturesMatching = true;
  var raw = rawer.getTransaction(json);
  while (signaturesMatching && i < tx.signatures.length) {
    var sig = tx.signatures[i];
    var pub = tx.issuers[i];
    signaturesMatching = crypto.verify(raw, sig, pub);
    sigResult.sigs[pub] = {
      matching: signaturesMatching,
      index: i
    };
    i++;
  }
  sigResult.matching = signaturesMatching;
  return sigResult;
}

function checkBunchOfTransactions(txs, done){
  var block = {
    getTransactions: function () {
      return txs;
    }
  };
  return co(function *() {
    let local_rule = rules.FUNCTIONS;
    yield local_rule.checkTxIssuers(block);
    yield local_rule.checkTxSources(block);
    yield local_rule.checkTxRecipients(block);
    yield local_rule.checkTxSignature(block);
    done && done();
  })
    .catch((err) => {
      if (done) return done(err);
      throw err;
    });
}

rules.HELPERS = {

  maxAcceleration: maxAcceleration,

  checkSingleMembershipSignature: checkSingleMembershipSignature,

  getSigResult: getSigResult,

  checkBunchOfTransactions: checkBunchOfTransactions,

  checkSingleTransactionLocally: (tx, done) => checkBunchOfTransactions([tx], done)
};

module.exports = rules;

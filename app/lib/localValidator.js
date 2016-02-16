"use strict";
var async      = require('async');
var util       = require('util');
var stream     = require('stream');
var crypto     = require('./crypto');
var rawer      = require('./rawer');
var hashf      = require('./hashf');
var Block      = require('../lib/entity/block');
var Identity   = require('../lib/entity/identity');
var Membership = require('../lib/entity/membership');

module.exports = function (conf) {
  
  return new LocalValidator(conf);
};

function LocalValidator (conf) {

  /**
  * Compilation of all local tests
  */
  this.validate = function (b, done) {
    var block = new Block(b);
    var that = this;
    async.series([
      async.apply(that.checkParameters,                           block),
      async.apply(that.checkProofOfWork,                          block),
      async.apply(that.checkInnerHash,                            block),
      async.apply(that.checkPreviousHash,                         block),
      async.apply(that.checkPreviousIssuer,                       block),
      async.apply(that.checkUnitBase,                             block),
      async.apply(that.checkBlockSignature,                       block),
      async.apply(that.checkBlockTimes,                           block),
      async.apply(that.checkIdentitiesSignature,                  block),
      async.apply(that.checkIdentitiesUserIDConflict,             block),
      async.apply(that.checkIdentitiesPubkeyConflict,             block),
      async.apply(that.checkIdentitiesMatchJoin,                  block),
      async.apply(that.checkRevokedNotInMemberships,              block),
      async.apply(that.checkRevokedUnicity,                       block),
      async.apply(that.checkRevokedAreExcluded,                   block),
      async.apply(that.checkMembershipsSignature,                 block),
      async.apply(that.checkPubkeyUnicity,                        block),
      async.apply(that.checkCertificationOneByIssuer,             block),
      async.apply(that.checkCertificationUnicity,                 block),
      async.apply(that.checkCertificationIsntForLeaverOrExcluded, block),
      async.apply(that.checkTxIssuers,                            block),
      async.apply(that.checkTxSources,                            block),
      async.apply(that.checkTxRecipients,                         block),
      async.apply(that.checkTxSignature,                          block)
    ], function (err) {
      done(err);
    });
  };

  /**
  * Compilation of all local tests BUT signature & PoW
  */
  this.validateWithoutPoWAndSignature = function (b, done) {
    var block = new Block(b);
    var that = this;
    async.series([
      async.apply(that.checkParameters,                           block),
      async.apply(that.checkPreviousHash,                         block),
      async.apply(that.checkPreviousIssuer,                       block),
      async.apply(that.checkUnitBase,                             block),
      async.apply(that.checkBlockTimes,                           block),
      async.apply(that.checkIdentitiesSignature,                  block),
      async.apply(that.checkIdentitiesUserIDConflict,             block),
      async.apply(that.checkIdentitiesPubkeyConflict,             block),
      async.apply(that.checkIdentitiesMatchJoin,                  block),
      async.apply(that.checkMembershipsSignature,                 block),
      async.apply(that.checkPubkeyUnicity,                        block),
      async.apply(that.checkCertificationOneByIssuer,             block),
      async.apply(that.checkCertificationUnicity,                 block),
      async.apply(that.checkCertificationIsntForLeaverOrExcluded, block),
      async.apply(that.checkTxIssuers,                            block),
      async.apply(that.checkTxSources,                            block),
      async.apply(that.checkTxRecipients,                         block),
      async.apply(that.checkTxSignature,                          block)
    ], function (err) {
      done(err);
    });
  };

  /**
  * Compilation of all local tests, BUT signatures testing
  */
  this.validateWithoutSignatures = function (block, done) {
    var that = this;
    async.series([
      async.apply(that.checkParameters,                           block),
      async.apply(that.checkPreviousHash,                         block),
      async.apply(that.checkPreviousIssuer,                       block),
      async.apply(that.checkUnitBase,                             block),
      async.apply(that.checkBlockTimes,                           block),
      async.apply(that.checkIdentitiesUserIDConflict,             block),
      async.apply(that.checkIdentitiesPubkeyConflict,             block),
      async.apply(that.checkIdentitiesMatchJoin,                  block),
      async.apply(that.checkPubkeyUnicity,                        block),
      async.apply(that.checkCertificationOneByIssuer,             block),
      async.apply(that.checkCertificationUnicity,                 block),
      async.apply(that.checkCertificationIsntForLeaverOrExcluded, block),
      async.apply(that.checkTxIssuers,                            block),
      async.apply(that.checkTxSources,                            block),
      async.apply(that.checkTxRecipients,                         block)
    ], function (err) {
      done(err);
    });
  };

  this.maxAcceleration = function () {
    return maxAcceleration();
  };

  function maxAcceleration () {
    return Math.ceil(conf.avgGenTime * Math.sqrt(2)) * (Math.ceil((conf.medianTimeBlocks + 1) / 2) + 1);
  }

  this.checkSingleMembershipSignature = checkSingleMembershipSignature;
  this.getSigResult = getSigResult;

  this.versionFilter = function (onError) {
    return new VersionFilter(onError);
  };

  this.checkParameters = check(function (block, done) {
    if (block.number == 0 && !block.parameters)
      done('Parameters must be provided for root block');
    else if (block.number > 0 && block.parameters)
      done('Parameters must not be provided for non-root block');
    else
      done();
  });

  this.checkProofOfWork = check(function (block, done) {
    var powRegexp = new RegExp('^0{' + Math.floor(block.powMin / 4) + '}');
    if (!block.hash.match(powRegexp))
      done('Not a proof-of-work');
    else
      done();
  });

  this.checkInnerHash = check(function (block, done) {
    let inner_hash = hashf(block.getRawInnerPart()).toUpperCase();
    if (block.inner_hash != inner_hash)
      done('Wrong inner hash');
    else
      done();
  });

  this.checkPreviousHash = check(function (block, done) {
    if (block.number == 0 && block.previousHash)
      done('PreviousHash must not be provided for root block');
    else if (block.number > 0 && !block.previousHash)
      done('PreviousHash must be provided for non-root block');
    else
      done();
  });

  this.checkPreviousIssuer = check(function (block, done) {
    if (block.number == 0 && block.previousIssuer)
      done('PreviousIssuer must not be provided for root block');
    else if (block.number > 0 && !block.previousIssuer)
      done('PreviousIssuer must be provided for non-root block');
    else
      done();
  });

  this.checkUnitBase = check(function (block, done) {
    if (block.dividend > 0 && !(block.unitbase === 0 || block.unitbase > 0))
      done('UnitBase must be provided for UD block');
    else
      done();
  });

  this.checkBlockSignature = check(function (block, done) {
    if (!crypto.verify(block.getRaw(), block.signature, block.issuer))
      done('Block\'s signature must match');
    else
      done();
  });

  this.checkBlockTimes = check(function (block, done) {
    var time = parseInt(block.time);
    var medianTime = parseInt(block.medianTime);
    if (block.number > 0 && (time < medianTime || time > medianTime + maxAcceleration()))
      done('A block must have its Time between MedianTime and MedianTime + ' + maxAcceleration());
    else if (block.number == 0 && time != medianTime)
      done('Root block must have Time equal MedianTime');
    else
      done();
  });

  this.checkIdentitiesSignature = check(function (block, done) {
    if (hasWrongSignatureForIdentities(block)) {
      done('Identity\'s signature must match');
      return;
    }
    else
      done();
  });

  this.checkIdentitiesUserIDConflict = check(function (block, done) {
    if (hasUserIDConflictInIdentities(block)) {
      done('Block must not contain twice same identity uid');
      return;
    }
    else
      done();
  });

  this.checkIdentitiesPubkeyConflict = check(function (block, done) {
    if (hasPubkeyConflictInIdentities(block)) {
      done('Block must not contain twice same identity pubkey');
      return;
    }
    else
      done();
  });

  this.checkIdentitiesMatchJoin = check(function (block, done) {
    if (hasEachIdentityMatchesANewcomer(block)) {
      done('Each identity must match a newcomer line with same userid and certts');
      return;
    }
    else
      done();
  });

  this.checkRevokedAreExcluded = check(function (block, done) {
    if (checkRevokedAreExcluded(block)) {
      done('A revoked member must be excluded');
      return;
    }
    else
      done();
  });

  this.checkRevokedUnicity = check(function (block, done) {
    if (checkRevokedUnicity(block)) {
      done('A single revocation per member is allowed');
      return;
    }
    else
      done();
  });

  this.checkRevokedNotInMemberships = check(function (block, done) {
    if (hasRevokedInMemberships(block)) {
      done('A revoked pubkey cannot have a membership in the same block');
      return;
    }
    else
      done();
  });

  this.checkMembershipsSignature = check(function (block, done) {
    if (hasWrongSignatureForMemberships(block)) {
      done('Membership\'s signature must match');
      return;
    }
    else
      done();
  });

  this.checkPubkeyUnicity = check(function (block, done) {
    if (hasMultipleTimesAPubkeyForKeyChanges(block)) {
      done('Block cannot contain a same pubkey more than once in joiners, actives, leavers and excluded');
      return;
    }
    else
      done();
  });

  this.checkCertificationOneByIssuer = check(function (block, done) {
    if (hasSeveralCertificationsFromSameIssuer(block)) {
      done('Block cannot contain two certifications from same issuer');
      return;
    }
    else
      done();
  });

  this.checkCertificationUnicity = check(function (block, done) {
    if (hasIdenticalCertifications(block)) {
      done('Block cannot contain identical certifications (A -> B)');
      return;
    }
    else
      done();
  });

  this.checkCertificationIsntForLeaverOrExcluded = check(function (block, done) {
    if (hasCertificationsFromLeaversOrExcluded(block)) {
      done('Block cannot contain certifications concerning leavers or excluded members');
      return;
    }
    else
      done();
  });

  this.checkTxIssuers = checkTxs(function (tx, done) {
    if (tx.issuers.length == 0) {
      done('A transaction must have at least 1 issuer'); return;
    }
    else
      done();
  });

  this.checkTxSources = check(function (block, done) {
    var txs = block.getTransactions();
    var sources = [];
    var i = 0;
    var existsIdenticalSource = false;
    while (!existsIdenticalSource && i < txs.length) {
      var tx = txs[i];
      if (!tx.inputs || tx.inputs.length == 0) {
        done('A transaction must have at least 1 source');
        return;
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
      done('It cannot exist 2 identical sources for transactions inside a given block');
    }
    else done();
  });

  this.checkTxRecipients = checkTxs(function (tx, done) {
    if (!tx.outputs || tx.outputs.length == 0) {
      done('A transaction must have at least 1 recipient'); return;
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
        done('It cannot exist 2 identical recipients inside a transaction'); return;
      }
      else done();
    }
  });

  this.checkTxSignature = check(function (block, done) {
    async.series([
      async.apply(checkTransactionsSignature, block)
    ], function (err) {
      done(err);
    });
  });

  this.checkSingleTransaction = function (tx, done) {
    this.checkBunchOfTransactions([tx], done);
  };

  this.checkBunchOfTransactions = function (txs, done) {
    var that = this;
    var block = {
      getTransactions: function () {
        return txs;
      }
    };
    async.series([
      async.apply(that.checkTxIssuers,          block),
      async.apply(that.checkTxSources,          block),
      async.apply(that.checkTxRecipients,       block),
      async.apply(that.checkTxSignature,        block)
    ], function (err) {
      done(err);
    });
  };

  this.checkPeerSignature = checkPeerSignature;

  /**
  * Function for testing constraints.
  * Useful for function signature reason: it won't give any result in final callback.
  */
  function check (fn) {
    return function (arg, done) {
      async.series([
        async.apply(fn, arg)
      ], function (err) {
        // Only return err as result
        done(err);
      });
    };
  }

  /**
  * Function for testing constraints.
  * Useful for function signature reason: it won't give any result in final callback.
  */
  function checkTxs (fn) {
    return function (block, done) {
      var txs = block.getTransactions();
      // Check rule against each transaction
      async.forEachSeries(txs, fn, function (err) {
        // Only return err as result
        done(err);
      });
    };
  }
}

function hasUserIDConflictInIdentities (block) {
  var uids = [];
  var i = 0;
  var conflict = false;
  while (!conflict && i < block.identities.length) {
    var uid = block.identities[i].split(':')[3];
    conflict = ~uids.indexOf(uid);
    uids.push(uid);
    i++;
  }
  return conflict;
}

function hasPubkeyConflictInIdentities (block) {
  var pubkeys = [];
  var i = 0;
  var conflict = false;
  while (!conflict && i < block.identities.length) {
    var pubk = block.identities[i].split(':')[0];
    conflict = ~pubkeys.indexOf(pubk);
    pubkeys.push(pubk);
    i++;
  }
  return conflict;
}

function hasRevokedInMemberships (block) {
  var i = 0;
  var conflict = false;
  while (!conflict && i < block.revoked.length) {
    let pubk = block.revoked[i].split(':')[0];
    conflict = existsPubkeyIn(pubk, block.joiners)
      || existsPubkeyIn(pubk, block.actives)
      || existsPubkeyIn(pubk, block.leavers);
    i++;
  }
  return conflict;
}

function checkRevokedAreExcluded(block) {
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
  return matchCount != pubkeys.length;
}

function checkRevokedUnicity(block) {
  let pubkeys = [];
  let conflict = false;
  let i = 0;
  while (!conflict && i < block.revoked.length) {
    let pubk = block.revoked[i].split(':')[0];
    conflict = ~pubkeys.indexOf(pubk);
    pubkeys.push(pubk);
    i++;
  }
  return conflict;
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

function hasEachIdentityMatchesANewcomer (block) {
  // N.B.: this function does not test for potential duplicates in
  // identities and/or joiners, this is another test responsability
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
  return matchCount != pubkeys.length;
}

function hasMultipleTimesAPubkeyForKeyChanges (block) {
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
  return conflict;
}

function hasSeveralCertificationsFromSameIssuer (block) {
  if (block.number == 0) {
    return false;
  } else {
    var issuers = [];
    var i = 0;
    var conflict = false;
    while (!conflict && i < block.certifications.length) {
      var issuer = block.certifications[i].split(':')[0];
      conflict = ~issuers.indexOf(issuer);
      issuers.push(issuer);
      i++;
    }
    return conflict;
  }
}

function hasIdenticalCertifications (block) {
  var certs = [];
  var i = 0;
  var conflict = false;
  while (!conflict && i < block.certifications.length) {
    var cert = block.certifications[i].split(':').slice(0,2).join(':');
    conflict = ~certs.indexOf(cert);
    certs.push(cert);
    i++;
  }
  return conflict;
}

function hasWrongSignatureForIdentities (block) {
  var i = 0;
  var wrongSig = false;
  while (!wrongSig && i < block.identities.length) {
    var idty = Identity.statics.fromInline(block.identities[i]);
    idty.currency = block.currency;
    wrongSig = !crypto.verify(idty.rawWithoutSig(), idty.sig, idty.pubkey);
    i++;
  }
  return wrongSig;
}

function hasWrongSignatureForMemberships (block) {
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
  return wrongSig;
}

function hasCertificationsFromLeaversOrExcluded (block) {
  var pubkeys = [];
  block.leavers.forEach(function(leaver){
    var pubk = leaver.split(':')[0];
    pubkeys.push(pubk);
  });
  block.excluded.forEach(function(excluded){
    var pubk = excluded;
    pubkeys.push(pubk);
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
  return conflict;
}

function checkTransactionsSignature (block, done) {
  var txs = block.getTransactions();
  // Check local coherence of each tx
  async.forEachSeries(txs, checkSingleTransactionSignature, done);
}

function checkSingleTransactionSignature (tx, done) {
  let sigResult = getSigResult(tx);
  done(sigResult.matching ? null : 'Signature from a transaction must match');
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

function checkPeerSignature (peer) {
  var raw = rawer.getPeerWithoutSignature(peer);
  var sig = peer.signature;
  var pub = peer.pubkey;
  var signaturesMatching = crypto.verify(raw, sig, pub);
  return !!signaturesMatching;
}

function checkSingleMembershipSignature(ms) {
  return crypto.verify(ms.getRaw(), ms.signature, ms.issuer);
}

function VersionFilter (onError) {

  stream.Transform.call(this, { objectMode: true });

  var that = this;

  this._write = function (json) {
    if (json && json.version && parseInt(json.version) == 1)
      that.push(json);
    else
      onError("Document version must be 1");
    that.push(null);
  };
}

util.inherits(VersionFilter, stream.Transform);

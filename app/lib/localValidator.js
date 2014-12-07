var async      = require('async');
var mongoose   = require('mongoose');
var crypto     = require('./crypto');
var common     = require('./common');
var rawer      = require('./rawer');
var constants  = require('./constants');
var Identity   = mongoose.model('Identity', require('../models/identity'));
var Membership = mongoose.model('Membership', require('../models/membership'));

module.exports = function (conf) {
  
  return new LocalValidator(conf);
};

function LocalValidator (conf) {

  /**
  * Compilation of all local tests
  */
  this.validate = function (block, done) {
    var that = this;
    async.series([
      async.apply(that.checkParameters,                           block),
      async.apply(that.checkProofOfWork,                          block),
      async.apply(that.checkPreviousHash,                         block),
      async.apply(that.checkPreviousIssuer,                       block),
      async.apply(that.checkBlockSignature,                       block),
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
      async.apply(that.checkTxSums,                               block),
      async.apply(that.checkTxIndexes,                            block),
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
      async.apply(that.checkTxRecipients,                         block),
      async.apply(that.checkTxSums,                               block),
      async.apply(that.checkTxIndexes,                            block)
    ], function (err) {
      done(err);
    });
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
    var powRegexp = new RegExp('^0{' + block.powMin + '}');
    if (!block.hash.match(powRegexp))
      done('Not a proof-of-work');
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

  this.checkBlockSignature = check(function (block, done) {
    if (!crypto.verify(block.getRaw(), block.signature, block.issuer))
      done('Block\'s signature must match');
    else
      done();
  });

  this.checkBlockTimes = check(function (block, done) {
    var time = parseInt(block.time);
    var medianTime = parseInt(block.medianTime);
    var maxGenTime = conf.avgGenTime * 4;
    if (block.number > 0 && (time < medianTime || time > medianTime + maxGenTime*constants.VALUES.AVG_SPEED_TIME_MARGIN))
      done('A block must have its Time between MedianTime and MedianTime + maxGenTime*' + constants.VALUES.AVG_SPEED_TIME_MARGIN);
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
        if (~recipients.indexOf(output.pubkey)) {
          existsIdenticalRecipient = true;
        } else {
          recipients.push(output.pubkey);
        }
      });
      if (existsIdenticalRecipient) {
        done('It cannot exist 2 identical recipients inside a transaction'); return;
      }
      else done();
    }
  });

  this.checkTxSums = checkTxs(function (tx, done) {
      // input sum == output sum
      var inputSum = 0;
      tx.inputs.forEach(function (input) {
        inputSum += input.amount;
      });
      var outputSum = 0;
      tx.outputs.forEach(function (output) {
        outputSum += output.amount;
      });
      if (inputSum != outputSum) {
        done('Input sum and output sum must be equal');
      }
      else done();
  });

  this.checkTxIndexes = checkTxs(function (tx, done) {
    // Signatures count == issuers.length
    if (tx.issuers.length != tx.signatures.length) {
      done('Number of signatures must be equal to number of issuers'); return;
    }
    // INDEX related
    var indexes = [];
    tx.inputs.forEach(function (input) {
      var index = input.index;
      if (indexes.indexOf(index) == -1)
        indexes.push(index);
    });
    // Indexes <= issuers.length
    if (tx.issuers.length != indexes.length) {
      done('Number of indexes must be equal to number of issuers'); return;
    }
    // It must appear each index 0..Nissuers - 1
    var containsAll = true;
    for (var i = 0; i < indexes.length; i++) {
      if (indexes.indexOf(i) == -1)
        containsAll = false;
    }
    if (!containsAll) {
      done('Each issuer must be present in sources'); return;
    }
    done();
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
      async.apply(that.checkTxSums,             block),
      async.apply(that.checkTxIndexes,          block),
      async.apply(that.checkTxSignature,        block)
    ], function (err) {
      done(err);
    });
  };

  this.checkSingleTransactionSignature = function (tx, done) {
    async.series([
      async.apply(checkSingleTransactionSignature, tx)
    ], function (err) {
      done(err);
    });
  };

  this.checkPeerSignature = function (peer, done) {
    async.series([
      async.apply(checkPeerSignature, peer)
    ], function (err) {
      done(err);
    });
  };

  this.checkStatusSignature = function (peer, done) {
    async.series([
      async.apply(checkStatusSignature, peer)
    ], function (err) {
      done(err);
    });
  };

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

function hasEachIdentityMatchesANewcomer (block) {
  // N.B.: this function does not test for potential duplicates in
  // identities and/or joiners, this is another test responsability
  var pubkeys = [];
  block.identities.forEach(function(inline){
    var sp = inline.split(':');
    var pubk = sp[0], ts = sp[2], uid = sp[3];
    pubkeys.push(pubk);
  });
  var matchCount = 0;
  var i = 0;
  while (i < block.joiners.length) {
    var sp = block.joiners[i].split(':');
    var pubk = sp[0], ts = sp[3], uid = sp[4];
    if (~pubkeys.indexOf(pubk)) matchCount++;
    i++;
  }
  return matchCount != pubkeys.length;
}

function hasMultipleTimesAPubkeyForKeyChanges (block) {
  var pubkeys = [];
  var conflict = false;
  // Joiners
  var i = 0;
  while (!conflict && i < block.joiners.length) {
    var pubk = block.joiners[i].split(':')[0];
    conflict = ~pubkeys.indexOf(pubk);
    pubkeys.push(pubk);
    i++;
  }
  // Actives
  i = 0;
  while (!conflict && i < block.actives.length) {
    var pubk = block.actives[i].split(':')[0];
    conflict = ~pubkeys.indexOf(pubk);
    pubkeys.push(pubk);
    i++;
  }
  // Leavers
  i = 0;
  while (!conflict && i < block.leavers.length) {
    var pubk = block.leavers[i].split(':')[0];
    conflict = ~pubkeys.indexOf(pubk);
    pubkeys.push(pubk);
    i++;
  }
  // Excluded
  i = 0;
  while (!conflict && i < block.excluded.length) {
    var pubk = block.excluded[i].split(':')[0];
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
    var idty = Identity.fromInline(block.identities[i]);
    wrongSig = !crypto.verify(idty.selfCert(), idty.sig, idty.pubkey);
    i++;
  }
  return wrongSig;
}

function hasWrongSignatureForMemberships (block) {
  var i = 0;
  var wrongSig = false;
  // Joiners
  while (!wrongSig && i < block.joiners.length) {
    var ms = Membership.fromInline(block.joiners[i], 'IN', block.currency);
    wrongSig = !crypto.verify(ms.getRaw(), ms.signature, ms.issuer);
    i++;
  }
  // Actives
  i = 0;
  while (!wrongSig && i < block.actives.length) {
    var ms = Membership.fromInline(block.actives[i], 'IN', block.currency);
    wrongSig = !crypto.verify(ms.getRaw(), ms.signature, ms.issuer);
    i++;
  }
  // Leavers
  i = 0;
  while (!wrongSig && i < block.leavers.length) {
    var ms = Membership.fromInline(block.leavers[i], 'OUT', block.currency);
    wrongSig = !crypto.verify(ms.getRaw(), ms.signature, ms.issuer);
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
  var json = { "version": tx.version, "currency": tx.currency, "inputs": [], "outputs": [], "issuers": tx.issuers, "signatures": [], "comment": tx.comment };
  tx.inputs.forEach(function (input) {
    json.inputs.push(input.raw);
  });
  tx.outputs.forEach(function (output) {
    json.outputs.push(output.raw);
  });
  var i = 0;
  var signaturesMatching = true;
  var raw = rawer.getTransaction(json);
  while (signaturesMatching && i < tx.signatures.length) {
    var sig = tx.signatures[i];
    var pub = tx.issuers[i];
    signaturesMatching = crypto.verify(raw, sig, pub);
    i++;
  }
  done(signaturesMatching ? null : 'Signature from a transaction must match');
}

function checkPeerSignature (peer, done) {
  var raw = rawer.getPeerWithoutSignature(peer);
  var sig = peer.signature;
  var pub = peer.pubkey || peer.pub;
  var signaturesMatching = crypto.verify(raw, sig, pub);
  done(signaturesMatching ? null : 'Signature from a peer must match');
}

function checkStatusSignature (status, done) {
  var raw = rawer.getStatusWithoutSignature(status);
  var sig = status.signature;
  var pub = status.from;
  var signaturesMatching = crypto.verify(raw, sig, pub);
  done(signaturesMatching ? null : 'Signature from a status must match');
}

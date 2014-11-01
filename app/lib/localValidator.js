var async      = require('async');
var mongoose   = require('mongoose');
var crypto     = require('./crypto');
var common     = require('./common');
var rawer      = require('./rawer');
var Identity   = mongoose.model('Identity', require('../models/identity'));
var Membership = mongoose.model('Membership', require('../models/membership'));

module.exports = function () {
  
  return new LocalValidator();
};

function LocalValidator () {

  this.checkSignatures = function (block, done) {
    if (hasWrongSignatureForIdentities(block)) {
      done('Identity\'s signature must match');
      return;
    }
    if (hasWrongSignatureForMemberships(block)) {
      done('Membership\'s signature must match');
      return;
    }
    if (!crypto.verify(block.getRaw(), block.signature, block.issuer)) {
      done('Signature must match');
      return;
    }
    done(null, true);
  };

  this.checkTransactionsOfBlock = function (block, done) {
    async.series([
      async.apply(checkTransactionsOfBlock, block)
    ], function (err) {
      done(err);
    });
  };

  this.checkTransactionsSignature = function (block, done) {
    async.series([
      async.apply(checkTransactionsSignature, block)
    ], function (err) {
      done(err);
    });
  };

  this.checkSingleTransaction = function (tx, done) {
    async.series([
      async.apply(checkTransactionCoherence, tx)
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

  this.validate = function (block, done) {
    if (hasUserIDConflictInIdentities(block)) {
      done('Block must not contain twice same identity uid');
      return;
    }
    if (hasPubkeyConflictInIdentities(block)) {
      done('Block must not contain twice same identity pubkey');
      return;
    }
    if (hasDateLowerThanConfirmedDate(block)) {
      done('A block must have its Date greater or equal to ConfirmedDate');
      return;
    }
    if (hasEachIdentityMatchesAJoin(block)) {
      done('Each identity must match a join membership line with same userid and certts');
      return;
    }
    if (hasMultipleTimesAPubkeyForKeyChanges(block)) {
      done('Block cannot contain a same pubkey more than once in joiners, leavers and excluded');
      return;
    }
    if (hasIdenticalCertifications(block)) {
      done('Block cannot contain identical certifications (A -> B)');
      return;
    }
    if (hasCertificationsFromLeaversOrExcluded(block)) {
      done('Block cannot contain certifications concerning leavers or excluded members');
      return;
    }
    if (false) {
      done('Block cannot contain twice same input for transactions');
      return;
    }
    if (false) {
      done('Block cannot contain transactions containing twice a same output');
      return;
    }
    if (false) {
      done('Block cannot contain transactions with output > input');
      return;
    }
    // Validated
    done(null, true);
  };
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

function hasDateLowerThanConfirmedDate (block) {
  var dateInt = parseInt(block.date);
  var confirmedInt = parseInt(block.confirmedDate);
  return dateInt < confirmedInt;
}

function hasEachIdentityMatchesAJoin (block) {
  // N.B.: this function does not test for potential duplicates in
  // identities and/or joiners, this is another test responsability
  var uids = [];
  block.identities.forEach(function(inline){
    var sp = inline.split(':');
    var pubk = sp[0], ts = sp[2], uid = sp[3];
    uids.push([pubk, ts, uid].join(':'));
  });
  var matchCount = 0;
  var i = 0;
  while (i < block.joiners.length) {
    var sp = block.joiners[i].split(':');
    var pubk = sp[0], ts = sp[3], uid = sp[4];
    var pattern = [pubk, ts, uid].join(':');
    if (~uids.indexOf(pattern)) matchCount++;
    i++;
  }
  return matchCount != uids.length;
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

function checkTransactionsOfBlock (block, done) {
  var txs = block.getTransactions();
    async.waterfall([
      function (next){
        // Check local coherence of each tx
        async.forEachSeries(txs, checkTransactionCoherence, next);
      },
      function (next){
        // Check local coherence of all txs as a whole
        checkTransactionPack(txs, next);
      }
    ], done);
}

function checkTransactionsSignature (block, done) {
  var txs = block.getTransactions();
  // Check local coherence of each tx
  async.forEachSeries(txs, checkSingleTransactionSignature, done);
}

function checkSingleTransactionSignature (tx, done) {
  var json = { "version": tx.version, "currency": tx.currency, "inputs": [], "outputs": [], "issuers": tx.issuers, "signatures": [] };
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

function checkTransactionCoherence (tx, done) {
  async.waterfall([
    function (next) {
      if (tx.issuers.length == 0) {
        next('A transaction must have at least 1 issuer'); return;
      }
      if (tx.inputs.length == 0) {
        next('A transaction must have at least 1 source'); return;
      }
      if (tx.outputs.length == 0) {
        next('A transaction must have at least 1 recipient'); return;
      }
      if (tx.signatures.length == 0) {
        next('A transaction must have at least 1 signature'); return;
      }
      // Signatures count == issuers.length
      if (tx.issuers.length != tx.signatures.length) {
        next('Number of signatures must be equal to number of issuers'); return;
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
        next('Number of indexes must be equal to number of issuers'); return;
      }
      // It must appear each index 0..Nissuers - 1
      var containsAll = true;
      for (var i = 0; i < indexes.length; i++) {
        if (indexes.indexOf(i) == -1)
          containsAll = false;
      }
      if (!containsAll) {
        next('Each issuer must be present in sources'); return;
      }
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
        next('Input sum and output sum must be equal'); return;
      }
      // Cannot have 2 identical sources
      var existsIdenticalSource = false;
      var sources = [];
      tx.inputs.forEach(function (input) {
        if (~sources.indexOf(input.raw)) {
          existsIdenticalSource = true;
        } else {
          sources.push(input.raw);
        }
      });
      if (existsIdenticalSource) {
        next('It cannot exist 2 identical sources inside a transaction'); return;
      }
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
        next('It cannot exist 2 identical recipients inside a transaction'); return;
      }
      next();
    }
  ], done);
}

function checkTransactionPack (txs, done) {
  var sources = [];
  var i = 0;
  var existsIdenticalSource = false;
  while (!existsIdenticalSource && i < txs.length) {
    var tx = txs[i];
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
    done('It cannot exist 2 identical sources for transactions inside a given block'); return;
  }
  done();
}

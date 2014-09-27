var crypto = require('./crypto');

module.exports = function () {
  
  return new LocalValidator();
};

function LocalValidator () {

  this.checkSignatures = function (block, done) {
    if (!crypto.verify(block.getRaw(), block.signature, block.issuer)) {
      done('Signature must match');
      return;
    }
    if (false) {
      done('Identity\'s signature must match');
      return;
    }
    if (false) {
      done('Membership\'s signature must match');
      return;
    }
    done(null, true);
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
    if (false) {
      done('Block cannot contain identical certifications (A -> B)');
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

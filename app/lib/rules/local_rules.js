"use strict";

const co         = require('co');
const _          = require('underscore');
const constants  = require('../constants');
const indexer    = require('../dup/indexer');
const hashf      = require('../ucp/hashf');
const keyring    = require('../crypto/keyring');
const rawer      = require('../ucp/rawer');
const Identity   = require('../entity/identity');
const Membership = require('../entity/membership');
const Transaction = require('../entity/transaction');

let rules = {};

// TODO: make a global variable 'index' instead of recomputing the index each time

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
    let remainder = block.powMin % 16;
    let nb_zeros = (block.powMin - remainder) / 16;
    const powRegexp = new RegExp('^0{' + nb_zeros + '}');
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
    if (block.number == 0 && block.unitbase != 0) {
      throw Error('UnitBase must equal 0 for root block');
    }
    return true;
  }),

  checkBlockSignature: (block) => co(function *() {
    if (!keyring.verify(block.getSignedPart(), block.signature, block.issuer))
      throw Error('Block\'s signature must match');
    return true;
  }),

  checkBlockTimes: (block, conf) => co(function *() {
    const time = parseInt(block.time);
    const medianTime = parseInt(block.medianTime);
    if (block.number > 0 && (time < medianTime || time > medianTime + maxAcceleration(block, conf)))
      throw Error('A block must have its Time between MedianTime and MedianTime + ' + maxAcceleration(block, conf));
    else if (block.number == 0 && time != medianTime)
      throw Error('Root block must have Time equal MedianTime');
    return true;
  }),

  checkIdentitiesSignature: (block) => co(function *() {
    let i = 0;
    let wrongSig = false;
    while (!wrongSig && i < block.identities.length) {
      const idty = Identity.statics.fromInline(block.identities[i]);
      idty.currency = block.currency;
      wrongSig = !keyring.verify(idty.rawWithoutSig(), idty.sig, idty.pubkey);
      if (wrongSig) {
        throw Error('Identity\'s signature must match');
      }
      i++;
    }
    return true;
  }),

  checkIdentitiesUserIDConflict: (block, conf) => co(function *() {
    const index = indexer.localIndex(block, conf);
    const creates = indexer.iindexCreate(index);
    const uids = _.chain(creates).pluck('uid').uniq().value();
    if (creates.length !== uids.length) {
      throw Error('Block must not contain twice same identity uid');
    }
    return true;
  }),

  checkIdentitiesPubkeyConflict: (block, conf) => co(function *() {
    const index = indexer.localIndex(block, conf);
    const creates = indexer.iindexCreate(index);
    const pubkeys = _.chain(creates).pluck('pub').uniq().value();
    if (creates.length !== pubkeys.length) {
      throw Error('Block must not contain twice same identity pubkey');
    }
    return true;
  }),

  checkIdentitiesMatchJoin: (block, conf) => co(function *() {
    const index = indexer.localIndex(block, conf);
    const icreates = indexer.iindexCreate(index);
    const mcreates = indexer.mindexCreate(index);
    for (const icreate of icreates) {
      const matching = _(mcreates).filter({ pub: icreate.pub });
      if (matching.length == 0) {
        throw Error('Each identity must match a newcomer line with same userid and certts');
      }
    }
    return true;
  }),

  checkRevokedAreExcluded: (block, conf) => co(function *() {
    const index = indexer.localIndex(block, conf);
    const iindex = indexer.iindex(index);
    const mindex = indexer.mindex(index);
    const revocations = _.chain(mindex)
      .filter((row) => row.op == constants.IDX_UPDATE && row.revoked_on !== null)
      .pluck('pub')
      .value();
    for (const pub of revocations) {
      const exclusions = _(iindex).where({ op: constants.IDX_UPDATE, member: false });
      if (exclusions.length == 0) {
        throw Error('A revoked member must be excluded');
      }
    }
    return true;
  }),

  checkRevokedUnicity: (block, conf) => co(function *() {
    try {
      yield rules.FUNCTIONS.checkMembershipUnicity(block, conf);
    } catch (e) {
      throw Error('A single revocation per member is allowed');
    }
    return true;
  }),

  checkMembershipUnicity: (block, conf) => co(function *() {
    const index = indexer.localIndex(block, conf);
    const mindex = indexer.mindex(index);
    const pubkeys = _.chain(mindex).pluck('pub').uniq().value();
    if (pubkeys.length !== mindex.length) {
      throw Error('Unicity constraint PUBLIC_KEY on MINDEX is not respected');
    }
    return true;
  }),

  checkMembershipsSignature: (block) => co(function *() {
    let i = 0;
    let wrongSig = false, ms;
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
    const pubkeys = [];
    let conflict = false;
    let pubk;
    // Joiners
    let i = 0;
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

  checkCertificationOneByIssuer: (block, conf) => co(function *() {
    if (block.number > 0) {
      const index = indexer.localIndex(block, conf);
      const cindex = indexer.cindex(index);
      const certFromA = _.uniq(cindex.map((row) => row.issuer));
      if (certFromA.length !== cindex.length) {
        throw Error('Block cannot contain two certifications from same issuer');
      }
    }
    return true;
  }),

  checkCertificationUnicity: (block, conf) => co(function *() {
    const index = indexer.localIndex(block, conf);
    const cindex = indexer.cindex(index);
    const certAtoB = _.uniq(cindex.map((row) => row.issuer + row.receiver));
    if (certAtoB.length !== cindex.length) {
      throw Error('Block cannot contain identical certifications (A -> B)');
    }
    return true;
  }),

  checkCertificationIsntForLeaverOrExcluded: (block, conf) => co(function *() {
    const index = indexer.localIndex(block, conf);
    const cindex = indexer.cindex(index);
    const iindex = indexer.iindex(index);
    const mindex = indexer.mindex(index);
    const certified = cindex.map((row) => row.receiver);
    for (const pub of certified) {
      const exclusions = _(iindex).where({ op: constants.IDX_UPDATE, member: false, pub: pub });
      const leavers    = _(mindex).where({ op: constants.IDX_UPDATE, leaving: true, pub: pub });
      if (exclusions.length > 0 || leavers.length > 0) {
        throw Error('Block cannot contain certifications concerning leavers or excluded members');
      }
    }
    return true;
  }),

  checkTxVersion: (block) => co(function *() {
    const txs = block.getTransactions();
    // Check rule against each transaction
    for (const tx of txs) {
      if (tx.version != 10) {
        throw Error('A transaction must have the version 10');
      }
    }
    return true;
  }),

  checkTxLen: (block) => co(function *() {
    const txs = block.getTransactions();
    // Check rule against each transaction
    for (const tx of txs) {
      const txLen = Transaction.statics.getLen(tx);
      if (txLen > constants.MAXIMUM_LEN_OF_COMPACT_TX) {
        throw constants.ERRORS.A_TRANSACTION_HAS_A_MAX_SIZE;
      }
    }
    return true;
  }),

  checkTxIssuers: (block) => co(function *() {
    const txs = block.getTransactions();
    // Check rule against each transaction
    for (const tx of txs) {
      if (tx.issuers.length == 0) {
        throw Error('A transaction must have at least 1 issuer');
      }
    }
    return true;
  }),

  checkTxSources: (block, conf) => co(function *() {
    const txs = block.getTransactions();
    for (const tx of txs) {
      if (!tx.inputs || tx.inputs.length == 0) {
        throw Error('A transaction must have at least 1 source');
      }
    }
    const sindex = indexer.localSIndex(block);
    const inputs = _.filter(sindex, (row) => row.op == constants.IDX_UPDATE).map((row) => [row.op, row.identifier, row.pos].join('-'));
    if (inputs.length !== _.uniq(inputs).length) {
      throw Error('It cannot exist 2 identical sources for transactions inside a given block');
    }
    const outputs = _.filter(sindex, (row) => row.op == constants.IDX_CREATE).map((row) => [row.op, row.identifier, row.pos].join('-'));
    if (outputs.length !== _.uniq(outputs).length) {
      throw Error('It cannot exist 2 identical sources for transactions inside a given block');
    }
    return true;
  }),

  checkTxAmounts: (block) => co(function *() {
    for (const tx of block.getTransactions()) {
      rules.HELPERS.checkTxAmountsValidity(tx);
    }
  }),

  checkTxRecipients: (block) => co(function *() {
    const txs = block.getTransactions();
    // Check rule against each transaction
    for (const tx of txs) {
      if (!tx.outputs || tx.outputs.length == 0) {
        throw Error('A transaction must have at least 1 recipient');
      }
      else {
        // Cannot have empty output condition
        for (const output of tx.outputs) {
          if (!output.conditions.match(/(SIG|XHX)/)) {
            throw Error('Empty conditions are forbidden');
          }
        }
      }
    }
    return true;
  }),

  checkTxSignature: (block) => co(function *() {
    const txs = block.getTransactions();
    // Check rule against each transaction
    for (const tx of txs) {
      let sigResult = getSigResult(tx);
      if (!sigResult.matching) {
        throw Error('Signature from a transaction must match');
      }
    }
    return true;
  })
};

function maxAcceleration (block, conf) {
  let maxGenTime = Math.ceil(conf.avgGenTime * constants.POW_DIFFICULTY_RANGE_RATIO);
  return Math.ceil(maxGenTime * conf.medianTimeBlocks);
}

function checkSingleMembershipSignature(ms) {
  return keyring.verify(ms.getRaw(), ms.signature, ms.issuer);
}

function getSigResult(tx, a) {
  let sigResult = { sigs: {}, matching: true };
  let json = { "version": tx.version, "currency": tx.currency, "blockstamp": tx.blockstamp, "locktime": tx.locktime, "inputs": [], "outputs": [], "issuers": tx.issuers, "signatures": [], "comment": tx.comment };
  tx.inputs.forEach(function (input) {
    json.inputs.push(input.raw);
  });
  tx.outputs.forEach(function (output) {
    json.outputs.push(output.raw);
  });
  json.unlocks = tx.unlocks;
  let i = 0;
  let signaturesMatching = true;
  const raw = rawer.getTransaction(json);
  while (signaturesMatching && i < tx.signatures.length) {
    const sig = tx.signatures[i];
    const pub = tx.issuers[i];
    signaturesMatching = keyring.verify(raw, sig, pub);
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
  const block = {
    getTransactions: function () {
      return txs;
    }
  };
  return co(function *() {
    try {
      let local_rule = rules.FUNCTIONS;
      yield local_rule.checkTxLen(block);
      yield local_rule.checkTxIssuers(block);
      yield local_rule.checkTxSources(block);
      yield local_rule.checkTxRecipients(block);
      yield local_rule.checkTxAmounts(block);
      yield local_rule.checkTxSignature(block);
      done && done();
    } catch (err) {
      if (done) return done(err);
      throw err;
    }
  });
}

rules.HELPERS = {

  maxAcceleration: maxAcceleration,

  checkSingleMembershipSignature: checkSingleMembershipSignature,

  getSigResult: getSigResult,

  checkBunchOfTransactions: checkBunchOfTransactions,

  checkSingleTransactionLocally: (tx, done) => checkBunchOfTransactions([tx], done),

  checkTxAmountsValidity: (tx) => {
    // Rule of money conservation
    const commonBase = tx.inputs.concat(tx.outputs).reduce((min, input) => {
      if (min === null) return input.base;
      return Math.min(min, parseInt(input.base));
    }, null);
    const inputSumCommonBase = tx.inputs.reduce((sum, input) => {
      return sum + input.amount * Math.pow(10, input.base - commonBase);
    }, 0);
    const outputSumCommonBase = tx.outputs.reduce((sum, output) => {
      return sum + output.amount * Math.pow(10, output.base - commonBase);
    }, 0);
    if (inputSumCommonBase !== outputSumCommonBase) {
      throw constants.ERRORS.TX_INPUTS_OUTPUTS_NOT_EQUAL;
    }
    // Rule of unit base transformation
    const maxOutputBase = tx.outputs.reduce((max, output) => {
      return Math.max(max, parseInt(output.base));
    }, 0);
    // Compute deltas
    const deltas = {};
    for (let i = commonBase; i <= maxOutputBase; i++) {
      const inputBaseSum = tx.inputs.reduce((sum, input) => {
        if (input.base == i) {
          return sum + input.amount * Math.pow(10, input.base - commonBase);
        } else {
          return sum;
        }
      }, 0);
      const outputBaseSum = tx.outputs.reduce((sum, output) => {
        if (output.base == i) {
          return sum + output.amount * Math.pow(10, output.base - commonBase);
        } else {
          return sum;
        }
      }, 0);
      const delta = outputBaseSum - inputBaseSum;
      let sumUpToBase = 0;
      for (let j = commonBase; j < i; j++) {
        sumUpToBase -= deltas[j];
      }
      if (delta > 0 && delta > sumUpToBase) {
        throw constants.ERRORS.TX_OUTPUT_SUM_NOT_EQUALS_PREV_DELTAS;
      }
      deltas[i] = delta;
    }
  },

  getMaxPossibleVersionNumber: (current, block) => co(function*() {
    // Looking at current blockchain, find what is the next maximum version we can produce

    // 1. We follow previous block's version
    let version = current ? current.version : constants.BLOCK_GENERATED_VERSION;

    // 2. If we can, we go to the next version
    return version;
  })
};

module.exports = rules;

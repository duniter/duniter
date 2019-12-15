// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import {BlockDTO} from "../dto/BlockDTO"
import {ConfDTO} from "../dto/ConfDTO"
import {CindexEntry, IndexEntry, Indexer, MindexEntry, SindexEntry} from "../indexer"
import {BaseDTO, TransactionDTO} from "../dto/TransactionDTO"
import {DBBlock} from "../db/DBBlock"
import {verify, verifyBuggy} from "../common-libs/crypto/keyring"
import {hashf} from "../common"
import {CommonConstants} from "../common-libs/constants"
import {IdentityDTO} from "../dto/IdentityDTO"
import {MembershipDTO} from "../dto/MembershipDTO"
import {Underscore} from "../common-libs/underscore"
import {FileDAL} from "../dal/fileDAL"

const constants       = CommonConstants
const maxAcceleration = require('./helpers').maxAcceleration

export const LOCAL_RULES_FUNCTIONS = {

  checkParameters: async (block:BlockDTO) => {
    if (block.number == 0 && !block.parameters) {
      throw Error('Parameters must be provided for root block');
    }
    else if (block.number > 0 && block.parameters) {
      throw Error('Parameters must not be provided for non-root block');
    }
    return true;
  },

  isProofOfWorkCorrect: (block:BlockDTO) => {
    let remainder = block.powMin % 16;
    let nb_zeros = (block.powMin - remainder) / 16;
    const powRegexp = new RegExp('^0{' + nb_zeros + '}');
    return !!block.hash.match(powRegexp)
  },

  checkProofOfWork: async (block:BlockDTO) => {
    if (!LOCAL_RULES_FUNCTIONS.isProofOfWorkCorrect(block)) {
      throw Error('Not a proof-of-work');
    }
    return true;
  },

  checkInnerHash: async (block:BlockDTO) => {
    let inner_hash = hashf(block.getRawInnerPart()).toUpperCase();
    if (block.inner_hash != inner_hash) {
      throw Error('Wrong inner hash');
    }
    return true;
  },

  checkPreviousHash: async (block:BlockDTO) => {
    if (block.number == 0 && block.previousHash) {
      throw Error('PreviousHash must not be provided for root block');
    }
    else if (block.number > 0 && !block.previousHash) {
      throw Error('PreviousHash must be provided for non-root block');
    }
    return true;
  },

  checkPreviousIssuer: async (block:BlockDTO) => {
    if (block.number == 0 && block.previousIssuer)
      throw Error('PreviousIssuer must not be provided for root block');
    else if (block.number > 0 && !block.previousIssuer)
      throw Error('PreviousIssuer must be provided for non-root block');
    return true;
  },

  checkUnitBase: async (block:BlockDTO) => {
    if (block.number == 0 && block.unitbase != 0) {
      throw Error('UnitBase must equal 0 for root block');
    }
    return true;
  },

  checkBlockSignature: async (block:BlockDTO) => {
    // Historically, Duniter used a buggy version of TweetNaCl (see #1390)
    // Starting with the v12 blocks, Duniter uses a fixed version of TweetNaCl. 
    if (block.version >= 12 && !verify(block.getSignedPart(), block.signature, block.issuer)) {
      throw Error('Block\'s signature must match');
    } else if (!verifyBuggy(block.getSignedPart(), block.signature, block.issuer)) {
      throw Error('Block\'s signature must match');
    }
    return true;
  },

  checkBlockTimes: async (block:BlockDTO, conf:ConfDTO) => {
    const time = block.time
    const medianTime = block.medianTime
    if (block.number > 0 && (time < medianTime || time > medianTime + maxAcceleration(conf)))
      throw Error('A block must have its Time between MedianTime and MedianTime + ' + maxAcceleration(conf));
    else if (block.number == 0 && time != medianTime)
      throw Error('Root block must have Time equal MedianTime');
    return true;
  },

  checkIdentitiesSignature: async (block:BlockDTO) => {
    let i = 0;
    let wrongSig = false;
    while (!wrongSig && i < block.identities.length) {
      const idty = IdentityDTO.fromInline(block.identities[i]);
      idty.currency = block.currency;
      wrongSig = !verifyBuggy(idty.rawWithoutSig(), idty.sig, idty.pubkey);
      if (wrongSig) {
        throw Error('Identity\'s signature must match');
      }
      i++;
    }
    return true;
  },

  checkIdentitiesUserIDConflict: async (block:BlockDTO, conf:ConfDTO, index:IndexEntry[]) => {
    const creates = Indexer.iindexCreate(index);
    const uids = Underscore.chain(creates).pluck('uid').uniq().value();
    if (creates.length !== uids.length) {
      throw Error('Block must not contain twice same identity uid');
    }
    return true;
  },

  checkIdentitiesPubkeyConflict: async (block:BlockDTO, conf:ConfDTO, index:IndexEntry[]) => {
    const creates = Indexer.iindexCreate(index);
    const pubkeys = Underscore.chain(creates).pluck('pub').uniq().value();
    if (creates.length !== pubkeys.length) {
      throw Error('Block must not contain twice same identity pubkey');
    }
    return true;
  },

  checkIdentitiesMatchJoin: async (block:BlockDTO, conf:ConfDTO, index:IndexEntry[]) => {
    const icreates = Indexer.iindexCreate(index);
    const mcreates = Indexer.mindexCreate(index);
    for (const icreate of icreates) {
      const matching = Underscore.where(mcreates, { pub: icreate.pub });
      if (matching.length == 0) {
        throw Error('Each identity must match a newcomer line with same userid and certts');
      }
    }
    return true;
  },

  checkRevokedAreExcluded: async (block:BlockDTO, conf:ConfDTO, index:IndexEntry[]) => {
    const iindex = Indexer.iindex(index);
    const mindex = Indexer.mindex(index);
    const revocations = mindex
      .filter((row:MindexEntry) => !!(row.op == constants.IDX_UPDATE && row.revoked_on !== null))
      .map(e => e.pub)
    for (const pub of revocations) {
      const exclusions = Underscore.where(iindex, { op: constants.IDX_UPDATE, member: false, pub })
      if (exclusions.length == 0) {
        throw Error('A revoked member must be excluded');
      }
    }
    return true;
  },

  checkRevokedUnicity: async (block:BlockDTO, conf:ConfDTO, index:IndexEntry[]) => {
    try {
      await LOCAL_RULES_FUNCTIONS.checkMembershipUnicity(block, conf, index);
    } catch (e) {
      throw Error('A single revocation per member is allowed');
    }
    return true;
  },

  checkMembershipUnicity: async (block:BlockDTO, conf:ConfDTO, index:IndexEntry[]) => {
    const mindex = Indexer.mindex(index);
    const pubkeys = Underscore.chain(mindex).pluck('pub').uniq().value();
    if (pubkeys.length !== mindex.length) {
      throw Error('Unicity constraint PUBLIC_KEY on MINDEX is not respected');
    }
    return true;
  },

  checkMembershipsSignature: async (block:BlockDTO) => {
    let i = 0;
    let wrongSig = false, ms;
    // Joiners
    while (!wrongSig && i < block.joiners.length) {
      ms = MembershipDTO.fromInline(block.joiners[i], 'IN', block.currency);
      wrongSig = !checkSingleMembershipSignature(ms);
      i++;
    }
    // Actives
    i = 0;
    while (!wrongSig && i < block.actives.length) {
      ms = MembershipDTO.fromInline(block.actives[i], 'IN', block.currency);
      wrongSig = !checkSingleMembershipSignature(ms);
      i++;
    }
    // Leavers
    i = 0;
    while (!wrongSig && i < block.leavers.length) {
      ms = MembershipDTO.fromInline(block.leavers[i], 'OUT', block.currency);
      wrongSig = !checkSingleMembershipSignature(ms);
      i++;
    }
    if (wrongSig) {
      throw Error('Membership\'s signature must match');
    }
    return true;
  },

  checkPubkeyUnicity: async (block:BlockDTO) => {
    const pubkeys = [];
    let conflict = false;
    let pubk;
    // Joiners
    let i = 0;
    while (!conflict && i < block.joiners.length) {
      pubk = block.joiners[i].split(':')[0];
      conflict = !!(~pubkeys.indexOf(pubk))
      pubkeys.push(pubk);
      i++;
    }
    // Actives
    i = 0;
    while (!conflict && i < block.actives.length) {
      pubk = block.actives[i].split(':')[0];
      conflict = !!(~pubkeys.indexOf(pubk))
      pubkeys.push(pubk);
      i++;
    }
    // Leavers
    i = 0;
    while (!conflict && i < block.leavers.length) {
      pubk = block.leavers[i].split(':')[0];
      conflict = !!(~pubkeys.indexOf(pubk))
      pubkeys.push(pubk);
      i++;
    }
    // Excluded
    i = 0;
    while (!conflict && i < block.excluded.length) {
      pubk = block.excluded[i].split(':')[0];
      conflict = !!(~pubkeys.indexOf(pubk))
      pubkeys.push(pubk);
      i++;
    }
    if (conflict) {
      throw Error('Block cannot contain a same pubkey more than once in joiners, actives, leavers and excluded');
    }
    return true;
  },

  checkCertificationOneByIssuer: async (block:BlockDTO, conf:ConfDTO, index:IndexEntry[]) => {
    if (block.number > 0) {
      const cindex = Indexer.cindex(index);
      const certFromA = Underscore.uniq(cindex.map((row:CindexEntry) => row.issuer));
      if (certFromA.length !== cindex.length) {
        throw Error('Block cannot contain two certifications from same issuer');
      }
    }
    return true;
  },

  checkCertificationUnicity: async (block:BlockDTO, conf:ConfDTO, index:IndexEntry[]) => {
    const cindex = Indexer.cindex(index);
    const certAtoB = Underscore.uniq(cindex.map((row:CindexEntry) => row.issuer + row.receiver));
    if (certAtoB.length !== cindex.length) {
      throw Error('Block cannot contain identical certifications (A -> B)');
    }
    return true;
  },

  checkCertificationIsntForLeaverOrExcluded: async (block:BlockDTO, conf:ConfDTO, index:IndexEntry[]) => {
    const cindex = Indexer.cindex(index);
    const iindex = Indexer.iindex(index);
    const mindex = Indexer.mindex(index);
    const certified = cindex.map((row:CindexEntry) => row.receiver);
    for (const pub of certified) {
      const exclusions = Underscore.where(iindex, { op: constants.IDX_UPDATE, member: false, pub: pub })
      const leavers    = Underscore.where(mindex, { op: constants.IDX_UPDATE, leaving: true, pub: pub })
      if (exclusions.length > 0 || leavers.length > 0) {
        throw Error('Block cannot contain certifications concerning leavers or excluded members');
      }
    }
    return true;
  },

  checkTxVersion: async (block:BlockDTO) => {
    const txs = block.transactions
    // Check rule against each transaction
    for (const tx of txs) {
      if (tx.version != 10) {
        throw Error('A transaction must have the version 10');
      }
    }
    return true;
  },

  checkTxLen: async (block:BlockDTO) => {
    const txs = block.transactions
    // Check rule against each transaction
    for (const tx of txs) {
      const txLen = TransactionDTO.fromJSONObject(tx).getLen()
      if (txLen > constants.MAXIMUM_LEN_OF_COMPACT_TX) {
        throw constants.ERRORS.A_TRANSACTION_HAS_A_MAX_SIZE;
      }
    }
    // Check rule against each output of each transaction
    for (const tx of txs) {
      for (const output of tx.outputs) {
        const out = typeof output === 'string' ? output : TransactionDTO.outputObj2Str(output)
        if (out.length > constants.MAXIMUM_LEN_OF_OUTPUT) {
          throw constants.ERRORS.MAXIMUM_LEN_OF_OUTPUT
        }
      }
    }
    // Check rule against each unlock of each transaction
    for (const tx of txs) {
      for (const unlock of tx.unlocks) {
        if (unlock.length > constants.MAXIMUM_LEN_OF_UNLOCK) {
          throw constants.ERRORS.MAXIMUM_LEN_OF_UNLOCK
        }
      }
    }
    return true;
  },

  checkTxIssuers: async (block:BlockDTO) => {
    const txs = block.transactions
    // Check rule against each transaction
    for (const tx of txs) {
      if (tx.issuers.length == 0) {
        throw Error('A transaction must have at least 1 issuer');
      }
    }
    return true;
  },

  checkTxSources: async (block:BlockDTO) => {
    const dto = BlockDTO.fromJSONObject(block)
    for (const tx of dto.transactions) {
      if (!tx.inputs || tx.inputs.length == 0) {
        throw Error('A transaction must have at least 1 source');
      }
    }
    const sindex = Indexer.localSIndex(dto);
    const inputs = Underscore.filter(sindex, (row:SindexEntry) => row.op == constants.IDX_UPDATE).map((row:SindexEntry) => [row.op, row.identifier, row.pos].join('-'));
    if (inputs.length !== Underscore.uniq(inputs).length) {
      throw Error('It cannot exist 2 identical sources for transactions inside a given block');
    }
    const outputs = Underscore.filter(sindex, (row:SindexEntry) => row.op == constants.IDX_CREATE).map((row:SindexEntry) => [row.op, row.identifier, row.pos].join('-'));
    if (outputs.length !== Underscore.uniq(outputs).length) {
      throw Error('It cannot exist 2 identical sources for transactions inside a given block');
    }
    return true;
  },

  checkTxAmounts: async (block:BlockDTO) => {
    for (const tx of block.transactions) {
      LOCAL_RULES_HELPERS.checkTxAmountsValidity(tx);
    }
  },

  checkTxRecipients: async (block:BlockDTO) => {
    const txs = block.transactions
    // Check rule against each transaction
    for (const tx of txs) {
      if (!tx.outputs || tx.outputs.length == 0) {
        throw Error('A transaction must have at least 1 recipient');
      }
      else {
        // Cannot have empty output condition
        for (const output of tx.outputsAsObjects()) {
          if (!output.conditions.match(/(SIG|XHX)/)) {
            throw Error('Empty conditions are forbidden');
          }
        }
      }
    }
    return true;
  },

  checkTxSignature: async (block:BlockDTO) => {
    const txs = block.transactions
    // Check rule against each transaction
    for (const tx of txs) {
      if (!tx.checkSignatures()) {
        throw Error('Signature from a transaction must match')
      }
    }
    return true;
  },

  checkMaxTransactionChainingDepth: async (block:BlockDTO, conf:ConfDTO, index:IndexEntry[]) => {
    const sindex = Indexer.sindex(index)
    const max = getMaxTransactionDepth(sindex)
    //
    const allowedMax = block.medianTime > CommonConstants.BLOCK_TX_CHAINING_ACTIVATION_MT ? CommonConstants.BLOCK_MAX_TX_CHAINING_DEPTH : 0
    if (max > allowedMax) {
      throw "The maximum transaction chaining length per block is " + CommonConstants.BLOCK_MAX_TX_CHAINING_DEPTH
    }
    return true
  }
}

export interface SindexShortEntry {
  op:string,
  identifier:string,
  pos:number,
  tx:string|null
}

function getMaxTransactionDepth(sindex:SindexShortEntry[]) {
  const ids = Underscore.uniq(Underscore.pluck(sindex, 'tx')) as string[] // We are sure because at this moment no UD is in the sources
  let maxTxChainingDepth = 0
  for (let id of ids) {
    maxTxChainingDepth = Math.max(maxTxChainingDepth, getTransactionDepth(id, sindex, 0))
  }
  return maxTxChainingDepth
}

function getTransactionDepth(txHash:string, sindex:SindexShortEntry[], localDepth = 0) {
  const inputs = Underscore.filter(sindex, (s:SindexShortEntry) => s.op === 'UPDATE' && s.tx === txHash)
  let depth = localDepth
  for (let input of inputs) {
    const consumedOutput = Underscore.findWhere(sindex, { op: 'CREATE', identifier: input.identifier, pos: input.pos })
    if (consumedOutput) {
      if (localDepth < 5) {
        // Cast: we are sure because at this moment no UD is in the sources
        const subTxDepth = getTransactionDepth(consumedOutput.tx as string, sindex, localDepth + 1)
        depth = Math.max(depth, subTxDepth)
      } else {
        depth++
      }
    }
  }
  return depth
}

function checkSingleMembershipSignature(ms:any) {
  return verifyBuggy(ms.getRaw(), ms.signature, ms.issuer);
}

function checkBunchOfTransactions(transactions:TransactionDTO[], conf:ConfDTO, medianTime: number, options?:{ dontCareAboutChaining?:boolean }){
  const block:any = { transactions, identities: [], joiners: [], actives: [], leavers: [], revoked: [], excluded: [], certifications: [], medianTime };
  const index = Indexer.localIndex(block, conf)
  return (async () => {
    let local_rule = LOCAL_RULES_FUNCTIONS;
    await local_rule.checkTxLen(block);
    await local_rule.checkTxIssuers(block);
    await local_rule.checkTxSources(block);
    await local_rule.checkTxRecipients(block);
    await local_rule.checkTxAmounts(block);
    await local_rule.checkTxSignature(block);
    if (!options || !options.dontCareAboutChaining) {
      await local_rule.checkMaxTransactionChainingDepth(block, conf, index);
    }
  })()
}

export const LOCAL_RULES_HELPERS = {

  maxAcceleration: (conf:ConfDTO) => maxAcceleration(conf),

  checkSingleMembershipSignature: checkSingleMembershipSignature,

  checkBunchOfTransactions,

  getTransactionDepth,

  getMaxTransactionDepth,

  checkSingleTransactionLocally: (tx:any, conf:ConfDTO) => checkBunchOfTransactions([tx], conf, 0),

  checkTxAmountsValidity: (tx:TransactionDTO) => {
    const inputs = tx.inputsAsObjects()
    const outputs = tx.outputsAsObjects()
    // Rule of money conservation
    const commonBase:number = (inputs as BaseDTO[]).concat(outputs).reduce((min:number, input) => {
      if (min === null) return input.base;
      return Math.min(min, input.base)
    }, 0)
    const inputSumCommonBase = inputs.reduce((sum, input) => {
      return sum + input.amount * Math.pow(10, input.base - commonBase);
    }, 0);
    const outputSumCommonBase = outputs.reduce((sum, output) => {
      return sum + output.amount * Math.pow(10, output.base - commonBase);
    }, 0);
    if (inputSumCommonBase !== outputSumCommonBase) {
      throw constants.ERRORS.TX_INPUTS_OUTPUTS_NOT_EQUAL;
    }
    // Rule of unit base transformation
    const maxOutputBase = outputs.reduce((max, output) => {
      return Math.max(max, output.base)
    }, 0)
    // Compute deltas
    const deltas:any = {};
    for (let i = commonBase; i <= maxOutputBase; i++) {
      const inputBaseSum = inputs.reduce((sum, input) => {
        if (input.base == i) {
          return sum + input.amount * Math.pow(10, input.base - commonBase);
        } else {
          return sum;
        }
      }, 0);
      const outputBaseSum = outputs.reduce((sum, output) => {
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

  getMaxPossibleVersionNumber: async (current:DBBlock|null, dal: FileDAL) => {
    // Looking at current blockchain, find what is the next maximum version we can produce

    return !current

      // 1. We use legacy version
      ? constants.BLOCK_GENESIS_VERSION : (async () => {

        // 2. If we can, we go to the next version
        const blocksInFrame = (await dal.getBlocksBetween(current.number - current.issuersFrame + 1, current.number))
          .sort((b1, b2) => b2.number - b1.number)
        const uniqIssuersInFrame = Underscore.uniq(blocksInFrame.map(b => b.issuer))
        const lastNonceOfEachIssuer = uniqIssuersInFrame.map(issuer => String(blocksInFrame.filter(b => b.issuer === issuer)[0].nonce))
        const nbNoncesWithNextVersionCode = lastNonceOfEachIssuer.filter(nonce => nonce.substr(-11, 3) === '999').length

        // More than 70% of the computing network converted? Let's go to next version.
        if (Math.floor(nbNoncesWithNextVersionCode / uniqIssuersInFrame.length) > 0.6) {
          return constants.DUBP_NEXT_VERSION
        }

        // Otherwise, we stay on same version
        return current.version
      })()
  }
}

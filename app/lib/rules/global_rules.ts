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

import {ConfDTO} from "../dto/ConfDTO"
import {FileDAL} from "../dal/fileDAL"
import {DBBlock} from "../db/DBBlock"
import {TransactionDTO, TxSignatureResult} from "../dto/TransactionDTO"
import {BlockDTO} from "../dto/BlockDTO"
import {verify} from "../common-libs/crypto/keyring"
import {rawer, txunlock} from "../common-libs/index"
import {CommonConstants} from "../common-libs/constants"
import {IdentityDTO} from "../dto/IdentityDTO"
import {hashf} from "../common"
import {Indexer} from "../indexer"
import {DBTx} from "../db/DBTx"
import {Tristamp} from "../common/Tristamp"

const _ = require('underscore')

const constants      = CommonConstants

// Empty logger by default
let logger = {
  debug: (...args:any[]) => {},
  warn: (...args:any[]) => {}
}

// TODO: all the global rules should be replaced by index rule someday

export interface ParamEval {
  successful:boolean
  funcName:string
  parameter:string
}

export function evalParams(params:string[], conditions = '', sigResult:TxSignatureResult): ParamEval[] {
  const res:ParamEval[] = []
  const issuers = sigResult.sigs.map(s => s.k)
  for (const func of params) {
    if (func.match(/^SIG/)) {
      const param = (func.match(/^SIG\((.*)\)$/) as string[])[1]
      const index = parseInt(param)
      const sigEntry = !isNaN(index) && index < issuers.length && sigResult.sigs[index]
      const signatory:{ k:string, ok:boolean } = sigEntry || { k: '', ok: false }
      res.push({
        funcName: 'SIG',
        parameter: signatory.k,
        successful: signatory.ok
      })
    }
    else if (func.match(/^XHX/)) {
      const password = (func.match(/^XHX\((.*)\)$/) as string[])[1]
      const hash = hashf(password)
      res.push({
        funcName: 'XHX',
        parameter: password,
        successful: conditions.indexOf('XHX(' + hash + ')') !== -1
      })
    }
  }
  return res
}

export const GLOBAL_RULES_FUNCTIONS = {

  checkIdentitiesAreWritable: async (block:{ identities:string[], version: number }, conf:ConfDTO, dal:FileDAL) => {
    let current = await dal.getCurrentBlockOrNull();
    for (const obj of block.identities) {
      let idty = IdentityDTO.fromInline(obj);
      let found = await dal.getWrittenIdtyByUIDForExistence(idty.uid)
      if (found) {
        throw Error('Identity already used');
      }
      // Because the window rule does not apply on initial certifications
      if (current && idty.buid != constants.SPECIAL_BLOCK) {
        // From DUP 0.5: we fully check the blockstamp
        const basedBlock = await dal.getAbsoluteValidBlockInForkWindowByBlockstamp(idty.buid) || { medianTime: 0 }
        // Check if writable
        let duration = current.medianTime - basedBlock.medianTime
        if (duration > conf.idtyWindow) {
          throw Error('Identity is too old and cannot be written');
        }
      }
    }
    return true;
  },

  checkSourcesAvailability: async (block:{ transactions:TransactionDTO[], medianTime: number }, conf:ConfDTO, dal:FileDAL, findSourceTx:(txHash:string) => Promise<DBTx|null>) => {
    const txs = block.transactions
    const current = await dal.getCurrentBlockOrNull();
    for (const tx of txs) {
      const inputs = tx.inputsAsObjects()
      const outputs = tx.outputsAsObjects()
      let unlocks:any = {};
      let sumOfInputs = 0;
      let maxOutputBase = current && current.unitbase || 0;
      for (const theUnlock of tx.unlocks) {
        let sp = theUnlock.split(':');
        let index = parseInt(sp[0]);
        unlocks[index] = sp[1];
      }
      for (let k = 0, len2 = inputs.length; k < len2; k++) {
        let src = inputs[k];
        let dbSrc = await dal.getSource(src.identifier, src.pos);
        logger.debug('Source %s:%s:%s:%s = %s', src.amount, src.base, src.identifier, src.pos, dbSrc && dbSrc.consumed);
        if (!dbSrc) {
          // For chained transactions which are checked on sandbox submission, we accept them if there is already
          // a previous transaction of the chain already recorded in the pool
          dbSrc = await (async () => {
            let hypotheticSrc:any = null;
            let targetTX = await findSourceTx(src.identifier);
            if (targetTX) {
              let outputStr = targetTX.outputs[src.pos];
              if (outputStr) {
                hypotheticSrc = TransactionDTO.outputStr2Obj(outputStr);
                hypotheticSrc.consumed = false;
                hypotheticSrc.time = 0;
              }
            }
            return hypotheticSrc;
          })()
        }
        if (!dbSrc || dbSrc.consumed) {
          logger.warn('Source ' + [src.type, src.identifier, src.pos].join(':') + ' is not available');
          throw constants.ERRORS.SOURCE_ALREADY_CONSUMED;
        }
        sumOfInputs += dbSrc.amount * Math.pow(10, dbSrc.base);
        if (block.medianTime - dbSrc.written_time < tx.locktime) {
          throw constants.ERRORS.LOCKTIME_PREVENT;
        }
        let unlockValues = unlocks[k]
        let unlocksForCondition:string[] = (unlockValues || '').split(' ')
        let unlocksMetadata:any = {};
        if (dbSrc.conditions) {

          if (dbSrc.conditions.match(/CLTV/)) {
            unlocksMetadata.currentTime = block.medianTime;
          }

          if (dbSrc.conditions.match(/CSV/)) {
            unlocksMetadata.elapsedTime = block.medianTime - dbSrc.written_time;
          }

          const sigs = tx.getTransactionSigResult()

          try {
            if (!txunlock(dbSrc.conditions, unlocksForCondition, sigs, unlocksMetadata)) {
              throw Error('Locked');
            }
          } catch (e) {
            logger.warn('Source ' + [src.amount, src.base, src.type, src.identifier, src.pos].join(':') + ' unlock fail');
            throw constants.ERRORS.WRONG_UNLOCKER;
          }
        } else {
          throw Error("Source with no conditions")
        }
      }
      let sumOfOutputs = outputs.reduce(function(p, output) {
        if (output.base > maxOutputBase) {
          throw constants.ERRORS.WRONG_OUTPUT_BASE;
        }
        return p + output.amount * Math.pow(10, output.base);
      }, 0);
      if (sumOfInputs !== sumOfOutputs) {
        logger.warn('Inputs/Outputs != 1 (%s/%s)', sumOfInputs, sumOfOutputs);
        throw constants.ERRORS.WRONG_AMOUNTS;
      }
    }
    return true;
  }
}

export const GLOBAL_RULES_HELPERS = {

  // Functions used in an external context too
  checkMembershipBlock: (ms:any, current:DBBlock|null, conf:ConfDTO, dal:FileDAL) => checkMSTarget(ms, current ? { number: current.number + 1} : { number: 0 }, conf, dal),

  checkCertificationIsValidInSandbox: (cert:any, current:BlockDTO, findIdtyFunc:any, conf:ConfDTO, dal:FileDAL) => {
    return checkCertificationShouldBeValid(current ? current : { number: 0, currency: '' }, cert, findIdtyFunc, conf, dal)
  },

  checkCertificationIsValidForBlock: (cert:any, block:{ number:number, currency:string }, findIdtyFunc:(b:{ number:number, currency:string }, pubkey:string, dal:FileDAL) => Promise<{
    pubkey:string
    uid:string
    buid:string
    sig:string}|null>, conf:ConfDTO, dal:FileDAL) => {
    return checkCertificationShouldBeValid(block, cert, findIdtyFunc, conf, dal)
  },

  isOver3Hops: async (member:any, newLinks:any, newcomers:string[], current:DBBlock|null, conf:ConfDTO, dal:FileDAL) => {
    if (!current) {
      return Promise.resolve(false);
    }
    try {
      return Indexer.DUP_HELPERS.checkPeopleAreNotOudistanced([member], newLinks, newcomers, conf, dal);
    } catch (e) {
      return true;
    }
  },

  checkExistsUserID: (uid:string, dal:FileDAL) => dal.getWrittenIdtyByUIDForExistence(uid),

  checkExistsPubkey: (pub:string, dal:FileDAL) => dal.getWrittenIdtyByPubkeyForExistence(pub),

  checkSingleTransaction: (
    tx:TransactionDTO,
    block:{ medianTime: number },
    conf:ConfDTO,
    dal:FileDAL,
    findSourceTx:(txHash:string) => Promise<DBTx|null>) => GLOBAL_RULES_FUNCTIONS.checkSourcesAvailability({
    transactions: [tx],
    medianTime: block.medianTime
  }, conf, dal, findSourceTx),

  checkTxBlockStamp: async (tx:TransactionDTO, dal:FileDAL) => {
    const number = parseInt(tx.blockstamp.split('-')[0])
    const hash = tx.blockstamp.split('-')[1];
    const basedBlock = await dal.getAbsoluteValidBlockInForkWindow(number, hash)
    if (!basedBlock) {
      throw "Wrong blockstamp for transaction";
    }
    // Valuates the blockstampTime field
    tx.blockstampTime = basedBlock.medianTime;
    const current = await dal.getCurrentBlockOrNull();
    if (current && current.medianTime > basedBlock.medianTime + constants.TX_WINDOW) {
      throw "Transaction has expired";
    }
  }
}

/*****************************
 *
 *      UTILITY FUNCTIONS
 *
 *****************************/

async function checkMSTarget (ms:any, block:any, conf:ConfDTO, dal:FileDAL) {
  if (block.number == 0 && ms.number != 0) {
    throw Error('Number must be 0 for root block\'s memberships');
  }
  else if (block.number == 0 && ms.fpr != 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855') {
    throw Error('Hash must be E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 for root block\'s memberships');
  }
  else if (block.number == 0) {
    return null; // Valid for root block
  } else {
    const basedBlock = await dal.getAbsoluteValidBlockInForkWindow(ms.number, ms.fpr)
    if (!basedBlock) {
      throw Error('Membership based on an unexisting block')
    }
    let current = await dal.getCurrentBlockOrNull();
    if (current && current.medianTime > basedBlock.medianTime + conf.msValidity) {
      throw Error('Membership has expired');
    }
    return basedBlock;
  }
}

async function checkCertificationShouldBeValid (block:{ number:number, currency:string }, cert:any, findIdtyFunc:(b:{ number:number, currency:string }, pubkey:string, dal:FileDAL) => Promise<{
  pubkey:string
  uid:string
  buid:string
  sig:string
}|null>, conf:ConfDTO, dal:FileDAL) {
  if (block.number == 0 && cert.block_number != 0) {
    throw Error('Number must be 0 for root block\'s certifications');
  } else {
    let basedBlock:Tristamp|null = {
      number: 0,
      hash: constants.SPECIAL_HASH,
      medianTime: 0
    }
    if (block.number != 0) {
      basedBlock = await dal.getTristampOf(cert.block_number)
      if (!basedBlock) {
        throw Error('Certification based on an unexisting block');
      }
      try {
        const issuer = await dal.getWrittenIdtyByPubkeyForIsMember(cert.from)
        if (!issuer || !issuer.member) {
          throw Error('Issuer is not a member')
        }
      } catch (e) {
        throw Error('Certifier must be a member')
      }
    }
    let idty = await findIdtyFunc(block, cert.to, dal)
    let current = block.number == 0 ? null : await dal.getCurrentBlockOrNull();
    if (!idty) {
      throw Error('Identity does not exist for certified');
    }
    else if (current && current.medianTime > basedBlock.medianTime + conf.sigValidity) {
      throw Error('Certification has expired');
    }
    else if (cert.from == idty.pubkey)
      throw Error('Rejected certification: certifying its own self-certification has no meaning');
    else {
      const buid = [cert.block_number, basedBlock.hash].join('-');
      if (cert.block_hash && buid != [cert.block_number, cert.block_hash].join('-'))
        throw Error('Certification based on an unexisting block buid. from ' + cert.from.substring(0,8) + ' to ' + idty.pubkey.substring(0,8));
      const raw = rawer.getOfficialCertification({
        currency: conf.currency,
        idty_issuer: idty.pubkey,
        idty_uid: idty.uid,
        idty_buid: idty.buid,
        idty_sig: idty.sig,
        issuer: cert.from,
        buid: buid,
        sig: ''
      })
      const verified = verify(raw, cert.sig, cert.from);
      if (!verified) {
        throw constants.ERRORS.WRONG_SIGNATURE_FOR_CERT
      }
      return true;
    }
  }
}

export function setLogger(newLogger:any) {
  logger = newLogger
}

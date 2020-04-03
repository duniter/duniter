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

import {GlobalFifoPromise} from "./GlobalFifoPromise"
import {FileDAL} from "../lib/dal/fileDAL"
import {ConfDTO} from "../lib/dto/ConfDTO"
import {DBIdentity} from "../lib/dal/sqliteDAL/IdentityDAL"
import {GLOBAL_RULES_FUNCTIONS, GLOBAL_RULES_HELPERS} from "../lib/rules/global_rules"
import {BlockDTO} from "../lib/dto/BlockDTO"
import {RevocationDTO} from "../lib/dto/RevocationDTO"
import {BasicIdentity, IdentityDTO} from "../lib/dto/IdentityDTO"
import {CertificationDTO} from "../lib/dto/CertificationDTO"
import {DBCert} from "../lib/dal/sqliteDAL/CertDAL"
import {verify} from "duniteroxyde"
import {FIFOService} from "./FIFOService"
import {MindexEntry} from "../lib/indexer"
import {DataErrors} from "../lib/common-libs/errors"
import {Tristamp} from "../lib/common/Tristamp"

"use strict";
const constants       = require('../lib/constants');

const BY_ABSORPTION = true;

export class IdentityService extends FIFOService {

  dal:FileDAL
  conf:ConfDTO
  logger:any

  constructor(fifoPromiseHandler:GlobalFifoPromise) {
    super(fifoPromiseHandler)
  }

  setConfDAL(newConf:ConfDTO, newDAL:FileDAL) {
    this.dal = newDAL;
    this.conf = newConf;
    this.logger = require('../lib/logger').NewLogger(this.dal.profile);
  }

  searchIdentities(search:string) {
    return this.dal.searchJustIdentities(search)
  }

  async findMember(search:string) {
    let idty = null;
    if (search.match(constants.PUBLIC_KEY)) {
      idty = await this.dal.getWrittenIdtyByPubkeyForHashing(search);
    }
    else {
      idty = await this.dal.getWrittenIdtyByUidForHashing(search);
    }
    if (!idty) {
      throw constants.ERRORS.NO_MEMBER_MATCHING_PUB_OR_UID;
    }

    let memberships: {
      blockstamp:string
      membership:string
      number:number
      fpr:string
      written_number:number|null
    }[] = []

    if (idty) {
      const mss = await this.dal.msDAL.getMembershipsOfIssuer(idty.pub);
      const mssFromMindex = await this.dal.mindexDAL.reducable(idty.pub);
      memberships = mss.map(m => {
        return {
          blockstamp: [m.blockNumber, m.blockHash].join('-'),
          membership: m.membership,
          number: m.blockNumber,
          fpr: m.blockHash,
          written_number: m.written_number
        }
      })
      memberships = memberships.concat(mssFromMindex.map((ms:MindexEntry) => {
        const sp = ms.created_on.split('-');
        return {
          blockstamp: ms.created_on,
          membership: ms.leaving ? 'OUT' : 'IN',
          number: parseInt(sp[0]),
          fpr: sp[1],
          written_number: parseInt(ms.written_on)
        }
      }))
    }

    return {
      idty: {
        pubkey: idty.pub,
        uid: idty.uid,
        buid: idty.created_on
      },
      memberships
    }
  }

  getPendingFromPubkey(pubkey:string) {
    return this.dal.getNonWritten(pubkey)
  }

  submitIdentity(idty:BasicIdentity, byAbsorption = false): Promise<DBIdentity> {
    const idtyObj = IdentityDTO.fromJSONObject(idty)
    const toSave = IdentityDTO.fromBasicIdentity(idty)
    // Force usage of local currency name, do not accept other currencies documents
    idtyObj.currency = this.conf.currency;
    const createIdentity = idtyObj.rawWithoutSig();
    const hash = idtyObj.getHash()
    return this.pushFIFO<DBIdentity>(hash, async () => {
      this.logger.info('⬇ IDTY %s %s', idty.pubkey, idty.uid);
      try {
        // Check signature's validity
        let verified = verify(createIdentity, idty.sig, idty.pubkey);
        if (!verified) {
          throw constants.ERRORS.SIGNATURE_DOES_NOT_MATCH;
        }
        let existing = await this.dal.getGlobalIdentityByHashForExistence(toSave.hash);
        if (existing) {
          throw constants.ERRORS.ALREADY_UP_TO_DATE;
        }
        else {
          // Create if not already written uid/pubkey
          let used = await GLOBAL_RULES_HELPERS.checkExistsPubkey(idty.pubkey, this.dal)
          if (used) {
            throw constants.ERRORS.PUBKEY_ALREADY_USED;
          }
          used = await GLOBAL_RULES_HELPERS.checkExistsUserID(idty.uid, this.dal)
          if (used) {
            throw constants.ERRORS.UID_ALREADY_USED;
          }
          const current = await this.dal.getCurrentBlockOrNull();
          if (idty.buid == '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855' && current) {
            throw constants.ERRORS.BLOCKSTAMP_DOES_NOT_MATCH_A_BLOCK;
          } else if (current) {
            let basedBlock = await this.dal.getAbsoluteValidBlockInForkWindowByBlockstamp(idty.buid);
            if (!basedBlock) {
              throw constants.ERRORS.BLOCKSTAMP_DOES_NOT_MATCH_A_BLOCK;
            }
            toSave.expires_on = basedBlock.medianTime + this.conf.idtyWindow;
          }
          await GLOBAL_RULES_FUNCTIONS.checkIdentitiesAreWritable({ identities: [idtyObj.inline()], version: (current && current.version) || constants.BLOCK_GENESIS_VERSION }, this.conf, this.dal);
          if (byAbsorption !== BY_ABSORPTION) {
            if (!(await this.dal.idtyDAL.sandbox.acceptNewSandBoxEntry({
              certsCount: 0,
              issuers: [idty.pubkey],
              ref_block: parseInt(idty.buid.split('-')[0])
            }, this.conf.pair && this.conf.pair.pub))) {
              throw constants.ERRORS.SANDBOX_FOR_IDENTITY_IS_FULL;
            }
          }
          await this.dal.savePendingIdentity(toSave)
          this.logger.info('✔ IDTY %s %s', idty.pubkey, idty.uid);
          return toSave
        }
      } catch (e) {
        this.logger.info('✘ IDTY %s %s', idty.pubkey, idty.uid);
        throw e
      }
    })
  }

  async submitCertification(obj:any): Promise<CertificationDTO> {
    const current = await this.dal.getCurrentBlockOrNull();
    // Prepare validator for certifications
    const potentialNext = BlockDTO.fromJSONObject({ currency: this.conf.currency, identities: [], number: current ? current.number + 1 : 0 });
    // Force usage of local currency name, do not accept other currencies documents
    obj.currency = this.conf.currency || obj.currency;
    const cert = CertificationDTO.fromJSONObject(obj)
    const targetHash = cert.getTargetHash();
    let possiblyNullIdty = await this.dal.getGlobalIdentityByHashForHashingAndSig(targetHash);
    let idtyAbsorbed = false
    const idty:{
      pubkey:string
      uid:string
      buid:string
      sig:string
    } = possiblyNullIdty !== null ? possiblyNullIdty : await this.submitIdentity({
      pubkey: cert.idty_issuer,
      uid: cert.idty_uid,
      buid: cert.idty_buid,
      sig: cert.idty_sig
    }, BY_ABSORPTION);
    if (possiblyNullIdty === null) {
      idtyAbsorbed = true
    }
    let anErr:any
    const hash = cert.getHash()
    return this.pushFIFO<CertificationDTO>(hash, async () => {
      this.logger.info('⬇ CERT %s block#%s -> %s', cert.from, cert.block_number, idty.uid);
      try {
        await GLOBAL_RULES_HELPERS.checkCertificationIsValidInSandbox(cert, potentialNext, () => Promise.resolve(idty), this.conf, this.dal);
      } catch (e) {
        anErr = e;
      }
      if (!anErr) {
        try {
          let basedBlock: Tristamp|null = await this.dal.getTristampOf(cert.block_number);
          if (cert.block_number == 0 && !basedBlock) {
            basedBlock = {
              number: 0,
              hash: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',
              medianTime: 0
            };
          }
          if (!basedBlock) {
            throw Error(DataErrors[DataErrors.CERT_BASED_ON_UNKNOWN_BLOCK])
          }
          const mCert:DBCert = {
            issuers: [cert.from],
            from: cert.from,
            sig: cert.sig,
            block_number: cert.block_number,
            block_hash: basedBlock.hash,
            target: targetHash,
            to: idty.pubkey,
            expires_on: basedBlock.medianTime + this.conf.sigWindow,
            linked: false,
            written: false,
            expired: false,
            written_block: null,
            written_hash: null,
            block: cert.block_number
          }
          if (current && mCert.expires_on < current.medianTime) {
            throw DataErrors[DataErrors.CERT_WINDOW_IS_PASSED]
          }
          let existingCert = await this.dal.existsCert(mCert, current)
          if (!existingCert) {
            if (!(await this.dal.certDAL.getSandboxForKey(cert.from).acceptNewSandBoxEntry(mCert, this.conf.pair && this.conf.pair.pub))) {
              throw constants.ERRORS.SANDBOX_FOR_CERT_IS_FULL;
            }
            await this.dal.registerNewCertification(mCert)
            this.logger.info('✔ CERT %s block#%s -> %s', cert.from, cert.block_number, idty.uid)
          } else {
            throw constants.ERRORS.ALREADY_UP_TO_DATE;
          }
        } catch (e) {
          anErr = e
        }
      }
      if (anErr) {
        if (idtyAbsorbed) {
          await this.dal.idtyDAL.deleteByHash(targetHash)
        }
        const err = anErr
        const errMessage = (err.uerr && err.uerr.message) || err.message || err
        this.logger.info('✘ CERT %s %s', cert.from, errMessage);
        throw anErr;
      }
      return cert;
    })
  }

  submitRevocation(obj:any) {
    // Force usage of local currency name, do not accept other currencies documents
    obj.currency = this.conf.currency || obj.currency;
    const revoc = RevocationDTO.fromJSONObject(obj)
    const raw = revoc.rawWithoutSig();
    const hash = revoc.getHash()
    return this.pushFIFO<RevocationDTO>(hash, async () => {
      try {
        this.logger.info('⬇ REVOCATION %s %s', revoc.pubkey, revoc.idty_uid);
        let verified = verify(raw, revoc.revocation, revoc.pubkey);
        if (!verified) {
          throw 'Wrong signature for revocation';
        }
        const existing = await this.dal.getGlobalIdentityByHashForRevocation(obj.hash)
        if (existing) {
          // Modify
          if (existing.revoked) {
            throw 'Already revoked';
          }
          else if (existing.revocation_sig) {
            throw 'Revocation already registered';
          } else {
            await this.dal.setRevocating({
              pubkey: existing.pub,
              buid: existing.created_on,
              sig: existing.sig,
              uid: existing.uid,
              expires_on: existing.expires_on,
              member: existing.member,
              wasMember: existing.wasMember,
            }, revoc.revocation);
            this.logger.info('✔ REVOCATION %s %s', revoc.pubkey, revoc.idty_uid);
            return revoc
          }
        }
        else {
          // Create identity given by the revocation
          const idty = IdentityDTO.fromRevocation(revoc);
          idty.revocation_sig = revoc.revocation;
          if (!(await this.dal.idtyDAL.sandbox.acceptNewSandBoxEntry({
              issuers: [idty.pubkey],
              ref_block: parseInt(idty.buid.split('-')[0]),
              certsCount: 0
            }, this.conf.pair && this.conf.pair.pub))) {
            throw constants.ERRORS.SANDBOX_FOR_IDENTITY_IS_FULL;
          }
          await this.dal.savePendingIdentity(idty);
          this.logger.info('✔ REVOCATION %s %s', revoc.pubkey, revoc.idty_uid);
          return revoc
        }
      } catch (e) {
        this.logger.info('✘ REVOCATION %s %s', revoc.pubkey, revoc.idty_uid);
        throw e;
      }
    })
  }
}

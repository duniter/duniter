import {GlobalFifoPromise} from "./GlobalFifoPromise"
import {FileDAL} from "../lib/dal/fileDAL"
import {ConfDTO} from "../lib/dto/ConfDTO"
import {DBIdentity} from "../lib/dal/sqliteDAL/IdentityDAL"
import {GLOBAL_RULES_FUNCTIONS, GLOBAL_RULES_HELPERS} from "../lib/rules/global_rules"
import {BlockDTO} from "../lib/dto/BlockDTO"

"use strict";
const keyring          = require('duniter-common').keyring;
const constants       = require('../lib/constants');
const Identity        = require('../../app/lib/entity/identity');
const Certification   = require('../../app/lib/entity/certification');
const Revocation      = require('../../app/lib/entity/revocation');

const BY_ABSORPTION = true;

export class IdentityService {

  dal:FileDAL
  conf:ConfDTO
  logger:any

  constructor() {}

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
      idty = await this.dal.getWrittenIdtyByPubkey(search);
    }
    else {
      idty = await this.dal.getWrittenIdtyByUID(search);
    }
    if (!idty) {
      throw constants.ERRORS.NO_MEMBER_MATCHING_PUB_OR_UID;
    }
    await this.dal.fillInMembershipsOfIdentity(Promise.resolve(idty));
    return new Identity(idty);
  }

  async findMemberWithoutMemberships(search:string) {
    let idty = null;
    if (search.match(constants.PUBLIC_KEY)) {
      idty = await this.dal.getWrittenIdtyByPubkey(search)
    }
    else {
      idty = await this.dal.getWrittenIdtyByUID(search)
    }
    if (!idty) {
      throw constants.ERRORS.NO_MEMBER_MATCHING_PUB_OR_UID;
    }
    return new Identity(idty);
  }

  getWrittenByPubkey(pubkey:string) {
    return this.dal.getWrittenIdtyByPubkey(pubkey)
  }

  getPendingFromPubkey(pubkey:string) {
    return this.dal.getNonWritten(pubkey)
  }

  submitIdentity(obj:DBIdentity, byAbsorption = false) {
    let idty = new Identity(obj);
    // Force usage of local currency name, do not accept other currencies documents
    idty.currency = this.conf.currency;
    const createIdentity = idty.rawWithoutSig();
    return GlobalFifoPromise.pushFIFO(async () => {
      this.logger.info('⬇ IDTY %s %s', idty.pubkey, idty.uid);
      // Check signature's validity
      let verified = keyring.verify(createIdentity, idty.sig, idty.pubkey);
      if (!verified) {
        throw constants.ERRORS.SIGNATURE_DOES_NOT_MATCH;
      }
      let existing = await this.dal.getIdentityByHashOrNull(idty.hash);
      if (existing) {
        throw constants.ERRORS.ALREADY_UP_TO_DATE;
      }
      else if (!existing) {
        // Create if not already written uid/pubkey
        let used = await this.dal.getWrittenIdtyByPubkey(idty.pubkey);
        if (used) {
          throw constants.ERRORS.PUBKEY_ALREADY_USED;
        }
        used = await this.dal.getWrittenIdtyByUID(idty.uid);
        if (used) {
          throw constants.ERRORS.UID_ALREADY_USED;
        }
        const current = await this.dal.getCurrentBlockOrNull();
        if (idty.buid == '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855' && current) {
          throw constants.ERRORS.BLOCKSTAMP_DOES_NOT_MATCH_A_BLOCK;
        } else if (current) {
          let basedBlock = await this.dal.getBlockByBlockstamp(idty.buid);
          if (!basedBlock) {
            throw constants.ERRORS.BLOCKSTAMP_DOES_NOT_MATCH_A_BLOCK;
          }
          idty.expires_on = basedBlock.medianTime + this.conf.idtyWindow;
        }
        await GLOBAL_RULES_FUNCTIONS.checkIdentitiesAreWritable({ identities: [idty.inline()], version: (current && current.version) || constants.BLOCK_GENERATED_VERSION }, this.conf, this.dal);
        idty = new Identity(idty);
        if (byAbsorption !== BY_ABSORPTION) {
          idty.ref_block = parseInt(idty.buid.split('-')[0]);
          if (!(await this.dal.idtyDAL.sandbox.acceptNewSandBoxEntry(idty, this.conf.pair && this.conf.pair.pub))) {
            throw constants.ERRORS.SANDBOX_FOR_IDENTITY_IS_FULL;
          }
        }
        await this.dal.savePendingIdentity(idty);
        this.logger.info('✔ IDTY %s %s', idty.pubkey, idty.uid);
        return idty;
      }
    })
  }

  async submitCertification(obj:any) {
    const current = await this.dal.getCurrentBlockOrNull();
    // Prepare validator for certifications
    const potentialNext = BlockDTO.fromJSONObject({ currency: this.conf.currency, identities: [], number: current ? current.number + 1 : 0 });
    // Force usage of local currency name, do not accept other currencies documents
    obj.currency = this.conf.currency || obj.currency;
    const cert = Certification.statics.fromJSON(obj);
    const targetHash = cert.getTargetHash();
    let idty = await this.dal.getIdentityByHashOrNull(targetHash);
    let idtyAbsorbed = false
    if (!idty) {
      idtyAbsorbed = true
      idty = await this.submitIdentity({
        pubkey: cert.idty_issuer,
        uid: cert.idty_uid,
        buid: cert.idty_buid,
        sig: cert.idty_sig,
        written: false,
        revoked: false,
        member: false,
        wasMember: false,
        kick: false,
        leaving: false,
        hash: '',
        wotb_id: null,
        expires_on: 0,
        revoked_on: null,
        revocation_sig: null,
        currentMSN: null,
        currentINN: null
      }, BY_ABSORPTION);
    }
    return GlobalFifoPromise.pushFIFO(async () => {
      this.logger.info('⬇ CERT %s block#%s -> %s', cert.from, cert.block_number, idty.uid);
      try {
        await GLOBAL_RULES_HELPERS.checkCertificationIsValid(cert, potentialNext, () => Promise.resolve(idty), this.conf, this.dal);
      } catch (e) {
        cert.err = e;
      }
      if (!cert.err) {
        try {
          let basedBlock = await this.dal.getBlock(cert.block_number);
          if (cert.block_number == 0 && !basedBlock) {
            basedBlock = {
              number: 0,
              hash: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'
            };
          } else {
            cert.expires_on = basedBlock.medianTime + this.conf.sigWindow;
          }
          cert.block_hash = basedBlock.hash;
          const mCert = new Certification({
            pubkey: cert.from,
            sig: cert.sig,
            block_number: cert.block_number,
            block_hash: cert.block_hash,
            target: targetHash,
            to: idty.pubkey,
            expires_on: cert.expires_on
          });
          let existingCert = await this.dal.existsCert(mCert);
          if (!existingCert) {
            if (!(await this.dal.certDAL.getSandboxForKey(cert.from).acceptNewSandBoxEntry(mCert, this.conf.pair && this.conf.pair.pub))) {
              throw constants.ERRORS.SANDBOX_FOR_CERT_IS_FULL;
            }
            await this.dal.registerNewCertification(new Certification(mCert));
            this.logger.info('✔ CERT %s', mCert.from);
          } else {
            throw constants.ERRORS.ALREADY_UP_TO_DATE;
          }
        } catch (e) {
          cert.err = e
        }
      }
      if (cert.err) {
        if (idtyAbsorbed) {
          await this.dal.idtyDAL.deleteByHash(targetHash)
        }
        const err = cert.err
        const errMessage = (err.uerr && err.uerr.message) || err.message || err
        this.logger.info('✘ CERT %s %s', cert.from, errMessage);
        throw cert.err;
      }
      return cert;
    })
  }

  submitRevocation(obj:any) {
    // Force usage of local currency name, do not accept other currencies documents
    obj.currency = this.conf.currency || obj.currency;
    const revoc = new Revocation(obj);
    const raw = revoc.rawWithoutSig();
    return GlobalFifoPromise.pushFIFO(async () => {
      try {
        this.logger.info('⬇ REVOCATION %s %s', revoc.pubkey, revoc.uid);
        let verified = keyring.verify(raw, revoc.revocation, revoc.pubkey);
        if (!verified) {
          throw 'Wrong signature for revocation';
        }
        const existing = await this.dal.getIdentityByHashOrNull(obj.hash);
        if (existing) {
          // Modify
          if (existing.revoked) {
            throw 'Already revoked';
          }
          else if (existing.revocation_sig) {
            throw 'Revocation already registered';
          } else {
            await this.dal.setRevocating(existing, revoc.revocation);
            this.logger.info('✔ REVOCATION %s %s', revoc.pubkey, revoc.uid);
            revoc.json = function() {
              return {
                result: true
              };
            };
            return revoc;
          }
        }
        else {
          // Create identity given by the revocation
          const idty = new Identity(revoc);
          idty.revocation_sig = revoc.signature;
          idty.certsCount = 0;
          idty.ref_block = parseInt(idty.buid.split('-')[0]);
          if (!(await this.dal.idtyDAL.sandbox.acceptNewSandBoxEntry(idty, this.conf.pair && this.conf.pair.pub))) {
            throw constants.ERRORS.SANDBOX_FOR_IDENTITY_IS_FULL;
          }
          await this.dal.savePendingIdentity(idty);
          this.logger.info('✔ REVOCATION %s %s', revoc.pubkey, revoc.uid);
          revoc.json = function() {
            return {
              result: true
            };
          };
          return revoc;
        }
      } catch (e) {
        this.logger.info('✘ REVOCATION %s %s', revoc.pubkey, revoc.uid);
        throw e;
      }
    })
  }
}

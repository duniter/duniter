"use strict";
const Q               = require('q');
const rules           = require('../lib/rules');
const keyring          = require('duniter-common').keyring;
const constants       = require('../lib/constants');
const Block           = require('../../app/lib/entity/block');
const Identity        = require('../../app/lib/entity/identity');
const Certification   = require('../../app/lib/entity/certification');
const Revocation      = require('../../app/lib/entity/revocation');
const AbstractService = require('./AbstractService');
const co              = require('co');

const BY_ABSORPTION = true;

module.exports = () => {
  return new IdentityService();
};

function IdentityService () {

  AbstractService.call(this);

  const that = this;
  let dal, conf, logger;

  this.setConfDAL = (newConf, newDAL) => {
    dal = newDAL;
    conf = newConf;
    logger = require('../lib/logger')(dal.profile);
  };

  this.searchIdentities = (search) => dal.searchJustIdentities(search);

  this.findMember = (search) => co(function *() {
    let idty = null;
    if (search.match(constants.PUBLIC_KEY)) {
      idty = yield dal.getWrittenIdtyByPubkey(search);
    }
    else {
      idty = yield dal.getWrittenIdtyByUID(search);
    }
    if (!idty) {
      throw constants.ERRORS.NO_MEMBER_MATCHING_PUB_OR_UID;
    }
    yield dal.fillInMembershipsOfIdentity(Q(idty));
    return new Identity(idty);
  });

  this.findMemberWithoutMemberships = (search) => co(function *() {
    let idty = null;
    if (search.match(constants.PUBLIC_KEY)) {
      idty = yield dal.getWrittenIdtyByPubkey(search);
    }
    else {
      idty = yield dal.getWrittenIdtyByUID(search);
    }
    if (!idty) {
      throw constants.ERRORS.NO_MEMBER_MATCHING_PUB_OR_UID;
    }
    return new Identity(idty);
  });

  this.getWrittenByPubkey = (pubkey) => dal.getWrittenIdtyByPubkey(pubkey);

  this.getPendingFromPubkey = (pubkey) => dal.getNonWritten(pubkey);

  this.submitIdentity = (obj, byAbsorption) => {
    let idty = new Identity(obj);
    // Force usage of local currency name, do not accept other currencies documents
    idty.currency = conf.currency || idty.currency;
    const createIdentity = idty.rawWithoutSig();
    return that.pushFIFO(() => co(function *() {
      logger.info('⬇ IDTY %s %s', idty.pubkey, idty.uid);
      // Check signature's validity
      let verified = keyring.verify(createIdentity, idty.sig, idty.pubkey);
      if (!verified) {
        throw constants.ERRORS.SIGNATURE_DOES_NOT_MATCH;
      }
      let existing = yield dal.getIdentityByHashOrNull(idty.hash);
      if (existing) {
        throw constants.ERRORS.ALREADY_UP_TO_DATE;
      }
      else if (!existing) {
        // Create if not already written uid/pubkey
        let used = yield dal.getWrittenIdtyByPubkey(idty.pubkey);
        if (used) {
          throw constants.ERRORS.PUBKEY_ALREADY_USED;
        }
        used = yield dal.getWrittenIdtyByUID(idty.uid);
        if (used) {
          throw constants.ERRORS.UID_ALREADY_USED;
        }
        const current = yield dal.getCurrentBlockOrNull();
        if (idty.buid == '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855' && current) {
          throw constants.ERRORS.BLOCKSTAMP_DOES_NOT_MATCH_A_BLOCK;
        } else if (current) {
          let basedBlock = yield dal.getBlockByBlockstamp(idty.buid);
          if (!basedBlock) {
            throw constants.ERRORS.BLOCKSTAMP_DOES_NOT_MATCH_A_BLOCK;
          }
          idty.expires_on = basedBlock.medianTime + conf.idtyWindow;
        }
        yield rules.GLOBAL.checkIdentitiesAreWritable({ identities: [idty.inline()], version: (current && current.version) || constants.BLOCK_GENERATED_VERSION }, conf, dal);
        idty = new Identity(idty);
        if (byAbsorption === BY_ABSORPTION) {
          idty.certsCount = 1;
        }
        idty.ref_block = parseInt(idty.buid.split('-')[0]);
        if (!(yield dal.idtyDAL.sandbox.acceptNewSandBoxEntry(idty, conf.pair && conf.pair.pub))) {
          throw constants.ERRORS.SANDBOX_FOR_IDENTITY_IS_FULL;
        }
        yield dal.savePendingIdentity(idty);
        logger.info('✔ IDTY %s %s', idty.pubkey, idty.uid);
        return idty;
      }
    }));
  };

  this.submitCertification = (obj) => co(function *() {
    const current = yield dal.getCurrentBlockOrNull();
    // Prepare validator for certifications
    const potentialNext = new Block({ currency: conf.currency, identities: [], number: current ? current.number + 1 : 0 });
    // Force usage of local currency name, do not accept other currencies documents
    obj.currency = conf.currency || obj.currency;
    const cert = Certification.statics.fromJSON(obj);
    const targetHash = cert.getTargetHash();
    let idty = yield dal.getIdentityByHashOrNull(targetHash);
    if (!idty) {
      idty = yield that.submitIdentity({
        currency: cert.currency,
        issuer: cert.idty_issuer,
        pubkey: cert.idty_issuer,
        uid: cert.idty_uid,
        buid: cert.idty_buid,
        sig: cert.idty_sig
      }, BY_ABSORPTION);
    }
    return that.pushFIFO(() => co(function *() {
      logger.info('⬇ CERT %s block#%s -> %s', cert.from, cert.block_number, idty.uid);
      try {
        yield rules.HELPERS.checkCertificationIsValid(cert, potentialNext, () => Q(idty), conf, dal);
      } catch (e) {
        cert.err = e;
      }
      if (!cert.err) {
        let basedBlock = yield dal.getBlock(cert.block_number);
        if (cert.block_number == 0 && !basedBlock) {
          basedBlock = {
            number: 0,
            hash: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'
          };
        } else {
          cert.expires_on = basedBlock.medianTime + conf.sigWindow;
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
        let existingCert = yield dal.existsCert(mCert);
        if (!existingCert) {
          if (!(yield dal.certDAL.sandbox.acceptNewSandBoxEntry(mCert, conf.pair && conf.pair.pub))) {
            throw constants.ERRORS.SANDBOX_FOR_CERT_IS_FULL;
          }
          yield dal.registerNewCertification(new Certification(mCert));
          logger.info('✔ CERT %s', mCert.from);
        } else {
          throw constants.ERRORS.ALREADY_UP_TO_DATE;
        }
      } else {
        logger.info('✘ CERT %s %s', cert.from, cert.err);
        throw cert.err;
      }
      return cert;
    }));
  });

  this.submitRevocation = (obj) => {
    // Force usage of local currency name, do not accept other currencies documents
    obj.currency = conf.currency || obj.currency;
    const revoc = new Revocation(obj);
    const raw = revoc.rawWithoutSig();
    return that.pushFIFO(() => co(function *() {
      try {
        logger.info('⬇ REVOCATION %s %s', revoc.pubkey, revoc.uid);
        let verified = keyring.verify(raw, revoc.revocation, revoc.pubkey);
        if (!verified) {
          throw 'Wrong signature for revocation';
        }
        const existing = yield dal.getIdentityByHashOrNull(obj.hash);
        if (existing) {
          // Modify
          if (existing.revoked) {
            throw 'Already revoked';
          }
          else if (existing.revocation_sig) {
            throw 'Revocation already registered';
          } else {
            yield dal.setRevocating(existing, revoc.revocation);
            logger.info('✔ REVOCATION %s %s', revoc.pubkey, revoc.uid);
            return jsonResultTrue();
          }
        }
        else {
          // Create identity given by the revocation
          const idty = new Identity(revoc);
          idty.revocation_sig = revoc.signature;
          idty.certsCount = 0;
          idty.ref_block = parseInt(idty.buid.split('-')[0]);
          if (!(yield dal.idtyDAL.sandbox.acceptNewSandBoxEntry(idty, conf.pair && conf.pair.pub))) {
            throw constants.ERRORS.SANDBOX_FOR_IDENTITY_IS_FULL;
          }
          yield dal.savePendingIdentity(idty);
          logger.info('✔ REVOCATION %s %s', revoc.pubkey, revoc.uid);
          return jsonResultTrue();
        }
      } catch (e) {
        logger.info('✘ REVOCATION %s %s', revoc.pubkey, revoc.uid);
        throw e;
      }
    }));
  };
}

function jsonResultTrue () {
  return {
    json: function() {
      return {
        result: true
      };
    }
  };
}

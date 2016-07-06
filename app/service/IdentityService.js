"use strict";
const Q               = require('q');
const rules           = require('../lib/rules');
const keyring          = require('../lib/crypto/keyring');
const constants       = require('../lib/constants');
const Block           = require('../../app/lib/entity/block');
const Identity        = require('../../app/lib/entity/identity');
const Certification   = require('../../app/lib/entity/certification');
const Revocation      = require('../../app/lib/entity/revocation');
const AbstractService = require('./AbstractService');
const co              = require('co');

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

  this.submitIdentity = (obj) => {
    let idty = new Identity(obj);
    const selfCert = idty.rawWithoutSig();
    return that.pushFIFO(() => co(function *() {
      logger.info('⬇ IDTY %s %s', idty.pubkey, idty.uid);
      // Check signature's validity
      let verified = keyring.verify(selfCert, idty.sig, idty.pubkey);
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
        idty = new Identity(idty);
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
      });
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
        }
        cert.block_hash = basedBlock.hash;
        const mCert = new Certification({
          pubkey: cert.from,
          sig: cert.sig,
          block_number: cert.block_number,
          block_hash: cert.block_hash,
          target: targetHash,
          to: idty.pubkey
        });
        let existingCert = yield dal.existsCert(mCert);
        if (!existingCert) {
          try {
            yield dal.registerNewCertification(new Certification(mCert));
            logger.info('✔ CERT %s', mCert.from);
          } catch (e) {
            // TODO: This is weird...
            logger.error(e);
            logger.info('✔ CERT %s', mCert.from);
          }
        }
      } else {
        logger.info('✘ CERT %s %s', cert.from, cert.err);
        throw cert.err;
      }
      return cert;
    }));
  });

  this.submitRevocation = (obj) => {
    const revoc = new Revocation(obj);
    const raw = revoc.rawWithoutSig();
    return that.pushFIFO(() => co(function *() {
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
          yield dal.setRevocating(obj.hash, revoc.revocation);
          return jsonResultTrue();
        }
      }
      else {
        // Create
        revoc.revoked = true;
        yield dal.savePendingIdentity(revoc);
        return jsonResultTrue();
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

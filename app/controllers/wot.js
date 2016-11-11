"use strict";
const co = require('co');
const _        = require('underscore');
const http2raw = require('../lib/helpers/http2raw');
const constants = require('../lib/constants');
const AbstractController = require('./abstract');
const logger   = require('../lib/logger')();

module.exports = function (server) {
  return new WOTBinding(server);
};

function WOTBinding (server) {

  AbstractController.call(this, server);

  const ParametersService = server.ParametersService;
  const IdentityService   = server.IdentityService;
  const BlockchainService   = server.BlockchainService;

  const Identity = require('../lib/entity/identity');

  this.lookup = (req) => co(function *() {
    // Get the search parameter from HTTP query
    const search = yield ParametersService.getSearchP(req);
    // Make the research
    const identities = yield IdentityService.searchIdentities(search);
    // Entitify each result
    identities.forEach((idty, index) => identities[index] = new Identity(idty));
    // Prepare some data to avoid displaying expired certifications
    const excluding = yield BlockchainService.getCertificationsExludingBlock();
    for (const idty of identities) {
      const certs = yield server.dal.certsToTarget(idty.getTargetHash());
      const validCerts = [];
      for (const cert of certs) {
        if (!(excluding && cert.block <= excluding.number)) {
          const member = yield IdentityService.getWrittenByPubkey(cert.from);
          if (member) {
            cert.uids = [member.uid];
            cert.isMember = member.member;
            cert.wasMember = member.wasMember;
          } else {
            const potentials = yield IdentityService.getPendingFromPubkey(cert.from);
            cert.uids = _(potentials).pluck('uid');
            cert.isMember = false;
            cert.wasMember = false;
          }
          validCerts.push(cert);
        }
      }
      idty.certs = validCerts;
      const signed = yield server.dal.certsFrom(idty.pubkey);
      const validSigned = [];
      for (let j = 0; j < signed.length; j++) {
        const cert = _.clone(signed[j]);
        if (!(excluding && cert.block <= excluding.number)) {
          cert.idty = yield server.dal.getIdentityByHashOrNull(cert.target);
          if (cert.idty) {
            validSigned.push(cert);
          } else {
            logger.debug('A certification to an unknown identity was found (%s => %s)', cert.from, cert.to);
          }
        }
      }
      idty.signed = validSigned;
    }
    if (identities.length == 0) {
      throw constants.ERRORS.NO_MATCHING_IDENTITY;
    }
    const resultsByPubkey = {};
    identities.forEach((identity) => {
      const jsoned = identity.json();
      if (!resultsByPubkey[jsoned.pubkey]) {
        // Create the first matching identity with this pubkey in the map
        resultsByPubkey[jsoned.pubkey] = jsoned;
      } else {
        // Merge the identity with the existing(s)
        const existing = resultsByPubkey[jsoned.pubkey];
        // We add the UID of the identity to the list of already added UIDs
        existing.uids = existing.uids.concat(jsoned.uids);
        // We do not merge the `signed`: every identity with the same pubkey has the same `signed` because it the *pubkey* which signs, not the identity
      }
    });
    return {
      partial: false,
      results: Object.values(resultsByPubkey)
    };
  });

  this.members = () => co(function *() {
    const identities = yield server.dal.getMembers();
    const json = {
      results: []
    };
    identities.forEach((identity) => json.results.push({ pubkey: identity.pubkey, uid: identity.uid }));
    return json;
  });

  this.certifiersOf = (req) => co(function *() {
    const search = yield ParametersService.getSearchP(req);
    const idty = yield IdentityService.findMemberWithoutMemberships(search);
    const excluding = yield BlockchainService.getCertificationsExludingBlock();
    const certs = yield server.dal.certsToTarget(idty.getTargetHash());
    idty.certs = [];
    for (const cert of certs) {
      if (!(excluding && cert.block <= excluding.number)) {
        const certifier = yield server.dal.getWrittenIdtyByPubkey(cert.from);
        if (certifier) {
          cert.uid = certifier.uid;
          cert.isMember = certifier.member;
          cert.sigDate = certifier.buid;
          cert.wasMember = true; // As we checked if(certified)
          if (!cert.cert_time) {
            // TODO: would be more efficient to save medianTime on certification reception
            let certBlock = yield server.dal.getBlock(cert.block_number);
            cert.cert_time = {
              block: certBlock.number,
              medianTime: certBlock.medianTime
            };
          }
          idty.certs.push(cert);
        }
      }
    }
    const json = {
      pubkey: idty.pubkey,
      uid: idty.uid,
      sigDate: idty.buid,
      isMember: idty.member,
      certifications: []
    };
    idty.certs.forEach(function(cert){
      json.certifications.push({
        pubkey: cert.from,
        uid: cert.uid,
        isMember: cert.isMember,
        wasMember: cert.wasMember,
        cert_time: cert.cert_time,
        sigDate: cert.sigDate,
        written: cert.linked ? {
          number: cert.written_block,
          hash: cert.written_hash
        } : null,
        signature: cert.sig
      });
    });
    return json;
  });

  this.requirements = (req) => co(function *() {
    const search = yield ParametersService.getSearchP(req);
    const identities = yield IdentityService.searchIdentities(search);
    const all = yield BlockchainService.requirementsOfIdentities(identities);
    if (!all || !all.length) {
      throw constants.ERRORS.NO_IDTY_MATCHING_PUB_OR_UID;
    }
    return {
      identities: all
    };
  });

  this.certifiedBy = (req) => co(function *() {
    const search = yield ParametersService.getSearchP(req);
    const idty = yield IdentityService.findMemberWithoutMemberships(search);
    const excluding = yield BlockchainService.getCertificationsExludingBlock();
    const certs = yield server.dal.certsFrom(idty.pubkey);
    idty.certs = [];
    for (const cert of certs) {
      if (!(excluding && cert.block <= excluding.number)) {
        const certified = yield server.dal.getWrittenIdtyByPubkey(cert.to);
        if (certified) {
          cert.uid = certified.uid;
          cert.isMember = certified.member;
          cert.sigDate = certified.buid;
          cert.wasMember = true; // As we checked if(certified)
          if (!cert.cert_time) {
            // TODO: would be more efficient to save medianTime on certification reception
            let certBlock = yield server.dal.getBlock(cert.block_number);
            cert.cert_time = {
              block: certBlock.number,
              medianTime: certBlock.medianTime
            };
          }
          idty.certs.push(cert);
        }
      }
    }
    const json = {
      pubkey: idty.pubkey,
      uid: idty.uid,
      sigDate: idty.buid,
      isMember: idty.member,
      certifications: []
    };
    idty.certs.forEach((cert) => json.certifications.push({
        pubkey: cert.to,
        uid: cert.uid,
        isMember: cert.isMember,
        wasMember: cert.wasMember,
        cert_time: cert.cert_time,
        sigDate: cert.sigDate,
        written: cert.linked ? {
          number: cert.written_block,
          hash: cert.written_hash
        } : null,
        signature: cert.sig
      })
    );
    return json;
  });

  this.identityOf = (req) => co(function *() {
    let search = yield ParametersService.getSearchP(req);
    let idty = yield IdentityService.findMemberWithoutMemberships(search);
    if (!idty) {
      throw 'Identity not found';
    }
    if (!idty.member) {
      throw 'Not a member';
    }
    return {
      pubkey: idty.pubkey,
      uid: idty.uid,
      sigDate: idty.buid
    };
  });

  this.add = (req) => this.pushEntity(req, http2raw.identity, constants.ENTITY_IDENTITY);

  this.certify = (req) => this.pushEntity(req, http2raw.certification, constants.ENTITY_CERTIFICATION);

  this.revoke = (req) => this.pushEntity(req, http2raw.revocation, constants.ENTITY_REVOCATION);

  this.pendingMemberships = (req) => co(function*() {
    const memberships = yield server.dal.findNewcomers();
    const json = {
      memberships: []
    };
    json.memberships = memberships.map((ms) => {
      return {
        pubkey: ms.issuer,
        uid: ms.userid,
        version: ms.version,
        currency: server.conf.currency,
        membership: ms.membership,
        blockNumber: parseInt(ms.blockNumber),
        blockHash: ms.blockHash,
        written: (!ms.written_number && ms.written_number !== 0) ? null : ms.written_number
      };
    });
    json.memberships = _.sortBy(json.memberships, 'blockNumber');
    json.memberships.reverse();
    return json;
  });
}

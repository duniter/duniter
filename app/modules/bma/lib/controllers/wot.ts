import {AbstractController} from "./AbstractController";
import {BMAConstants} from "../constants";
import {DBIdentity} from "../../../../lib/dal/sqliteDAL/IdentityDAL";
import {
  HttpCert,
  HttpCertIdentity, HttpCertifications,
  HttpIdentity,
  HttpIdentityRequirement,
  HttpLookup,
  HttpMembers,
  HttpMembershipList,
  HttpRequirements,
  HttpResult, HttpSimpleIdentity
} from "../dtos";

const _        = require('underscore');
const http2raw = require('../http2raw');

const ParametersService = require('../parameters').ParametersService

export class WOTBinding extends AbstractController {

  async lookup(req:any): Promise<HttpLookup> {
    // Get the search parameter from HTTP query
    const search = await ParametersService.getSearchP(req);
    // Make the research
    const identities:any[] = await this.IdentityService.searchIdentities(search);
    // Entitify each result
    identities.forEach((idty, index) => identities[index] = DBIdentity.copyFromExisting(idty));
    // Prepare some data to avoid displaying expired certifications
    for (const idty of identities) {
      const certs = await this.server.dal.certsToTarget(idty.pubkey, idty.getTargetHash());
      const validCerts = [];
      for (const cert of certs) {
        const member = await this.IdentityService.getWrittenByPubkey(cert.from);
        if (member) {
          cert.uids = [member.uid];
          cert.isMember = member.member;
          cert.wasMember = member.wasMember;
        } else {
          const potentials = await this.IdentityService.getPendingFromPubkey(cert.from);
          cert.uids = _(potentials).pluck('uid');
          cert.isMember = false;
          cert.wasMember = false;
        }
        validCerts.push(cert);
      }
      idty.certs = validCerts;
      const signed = await this.server.dal.certsFrom(idty.pubkey);
      const validSigned = [];
      for (let j = 0; j < signed.length; j++) {
        const cert = _.clone(signed[j]);
        cert.idty = await this.server.dal.getIdentityByHashOrNull(cert.target);
        if (cert.idty) {
          validSigned.push(cert);
        } else {
          this.logger.debug('A certification to an unknown identity was found (%s => %s)', cert.from, cert.to);
        }
      }
      idty.signed = validSigned;
    }
    if (identities.length == 0) {
      throw BMAConstants.ERRORS.NO_MATCHING_IDENTITY;
    }
    const resultsByPubkey:any = {};
    identities.forEach((identity) => {
      const copy = DBIdentity.copyFromExisting(identity)
      const jsoned = copy.json();
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
      results: _.values(resultsByPubkey)
    };
  }

  async members(): Promise<HttpMembers> {
    const identities = await this.server.dal.getMembers();
    const json:any = {
      results: []
    };
    identities.forEach((identity:any) => json.results.push({ pubkey: identity.pubkey, uid: identity.uid }));
    return json;
  }

  async certifiersOf(req:any): Promise<HttpCertifications> {
    const search = await ParametersService.getSearchP(req);
    const idty = await this.IdentityService.findMemberWithoutMemberships(search);
    const certs = await this.server.dal.certsToTarget(idty.pubkey, idty.getTargetHash());
    idty.certs = [];
    for (const cert of certs) {
      const certifier = await this.server.dal.getWrittenIdtyByPubkey(cert.from);
      if (certifier) {
        cert.uid = certifier.uid;
        cert.isMember = certifier.member;
        cert.sigDate = certifier.buid;
        cert.wasMember = true; // As we checked if(certified)
        if (!cert.cert_time) {
          let certBlock = await this.server.dal.getBlock(cert.block_number);
          cert.cert_time = {
            block: certBlock.number,
            medianTime: certBlock.medianTime
          };
        }
        idty.certs.push(cert);
      }
    }
    const json:any = {
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
  }

  async requirements(req:any): Promise<HttpRequirements> {
    const search = await ParametersService.getSearchP(req);
    const identities:any = await this.IdentityService.searchIdentities(search);
    const all:HttpIdentityRequirement[] = await this.BlockchainService.requirementsOfIdentities(identities);
    if (!all || !all.length) {
      throw BMAConstants.ERRORS.NO_IDTY_MATCHING_PUB_OR_UID;
    }
    return {
      identities: all
    };
  }

  async requirementsOfPending(req:any): Promise<HttpRequirements> {
    const minsig = ParametersService.getMinSig(req)
    const identities = await this.server.dal.idtyDAL.query('SELECT i.*, count(c.sig) as nbSig FROM idty i, cert c WHERE c.target = i.hash group by i.hash having nbSig >= ?', minsig)
    const all = await this.BlockchainService.requirementsOfIdentities(identities);
    if (!all || !all.length) {
      throw BMAConstants.ERRORS.NO_IDTY_MATCHING_PUB_OR_UID;
    }
    return {
      identities: all
    };
  }

  async certifiedBy(req:any): Promise<HttpCertifications> {
    const search = await ParametersService.getSearchP(req);
    const idty = await this.IdentityService.findMemberWithoutMemberships(search);
    const certs = await this.server.dal.certsFrom(idty.pubkey);
    idty.certs = [];
    for (const cert of certs) {
      const certified = await this.server.dal.getWrittenIdtyByPubkey(cert.to);
      if (certified) {
        cert.uid = certified.uid;
        cert.isMember = certified.member;
        cert.sigDate = certified.buid;
        cert.wasMember = true; // As we checked if(certified)
        if (!cert.cert_time) {
          let certBlock = await this.server.dal.getBlock(cert.block_number);
          cert.cert_time = {
            block: certBlock.number,
            medianTime: certBlock.medianTime
          };
        }
        idty.certs.push(cert);
      }
    }
    const json:any = {
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
  }

  async identityOf(req:any): Promise<HttpSimpleIdentity> {
    let search = await ParametersService.getSearchP(req);
    let idty = await this.IdentityService.findMemberWithoutMemberships(search);
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
  }

  async add(req:any): Promise<HttpIdentity> {
    const res = await this.pushEntity(req, http2raw.identity, (raw:string) => this.server.writeRawIdentity(raw))
    return {
      pubkey: res.pubkey,
      uids: [],
      signed: []
    }
  }

  async certify(req:any): Promise<HttpCert> {
    const res = await this.pushEntity(req, http2raw.certification, (raw:string) => this.server.writeRawCertification(raw))
    const target:HttpCertIdentity = {
      issuer: res.idty_issuer,
      uid: res.idty_uid,
      timestamp: res.idty_buid,
      sig: res.idty_sig
    }
    return {
      issuer: res.issuer,
      timestamp: res.buid,
      sig: res.sig,
      target
    }
  }

  async revoke(req:any): Promise<HttpResult> {
    const res = await this.pushEntity(req, http2raw.revocation, (raw:string) => this.server.writeRawRevocation(raw))
    return {
      result: true
    }
  }

  async pendingMemberships(): Promise<HttpMembershipList> {
    const memberships = await this.server.dal.findNewcomers();
    const json = {
      memberships: memberships.map((ms:any) => {
        return {
          pubkey: ms.issuer,
          uid: ms.userid,
          version: ms.version || 0,
          currency: this.server.conf.currency,
          membership: ms.membership,
          blockNumber: parseInt(ms.blockNumber),
          blockHash: ms.blockHash,
          written: (!ms.written_number && ms.written_number !== 0) ? null : ms.written_number
        };
      })
    };
    json.memberships = _.sortBy(json.memberships, 'blockNumber');
    json.memberships.reverse();
    return json;
  }
}

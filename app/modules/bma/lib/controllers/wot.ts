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

import {IindexEntry} from './../../../../lib/indexer';
import {AbstractController} from "./AbstractController";
import {BMAConstants} from "../constants";
import {DBIdentity} from "../../../../lib/dal/sqliteDAL/IdentityDAL";
import {IdentityForRequirements} from '../../../../service/BlockchainService';
import {
  HttpCert,
  HttpCertIdentity,
  HttpCertification,
  HttpCertifications,
  HttpIdentity,
  HttpIdentityRequirement,
  HttpLookup,
  HttpMembers,
  HttpMembershipList,
  HttpRequirements,
  HttpResult,
  HttpSimpleIdentity
} from "../dtos";
import {IdentityDTO} from "../../../../lib/dto/IdentityDTO"
import {FullIindexEntry} from "../../../../lib/indexer"

const _        = require('underscore');
const http2raw = require('../http2raw');
const constants = require('../../../../lib/constants');

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
      const certs: any[] = await this.server.dal.certsToTarget(idty.pubkey, idty.getTargetHash());
      const validCerts = [];
      for (const cert of certs) {
        const member = await this.server.dal.getWrittenIdtyByPubkeyForUidAndIsMemberAndWasMember(cert.from);
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
        cert.idty = await this.server.dal.getGlobalIdentityByHashForLookup(cert.target)
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
    const resultsByPubkey:{[k:string]:HttpIdentity} = {};
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
    const idty = (await this.server.dal.getWrittenIdtyByPubkeyOrUIdForHashingAndIsMember(search)) as FullIindexEntry
    const certs = await this.server.dal.certsToTarget(idty.pub, IdentityDTO.getTargetHash(idty))
    const theCerts:HttpCertification[] = [];
    for (const cert of certs) {
      const certifier = await this.server.dal.getWrittenIdtyByPubkeyForUidAndMemberAndCreatedOn(cert.from);
      if (certifier) {
        let certBlock = await this.server.dal.getBlock(cert.block_number)
        theCerts.push({
          pubkey: cert.from,
          uid: certifier.uid,
          isMember: certifier.member,
          wasMember: true, // a member is necessarily certified by members
          cert_time: {
            block: certBlock.number,
            medianTime: certBlock.medianTime
          },
          sigDate: certifier.created_on,
          written: (cert.written_block !== null && cert.written_hash) ? {
            number: cert.written_block,
            hash: cert.written_hash
          } : null,
          signature: cert.sig
        })
      }
    }
    return {
      pubkey: idty.pub,
      uid: idty.uid,
      sigDate: idty.created_on,
      isMember: idty.member,
      certifications: theCerts
    }
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
    let identities:IdentityForRequirements[] = (await this.server.dal.idtyDAL.query(
      'SELECT i.*, count(c.sig) as nbSig ' +
      'FROM idty i, cert c ' +
      'WHERE c.target = i.hash group by i.hash having nbSig >= ?',
      [minsig])).map(i => ({
      hash: i.hash || "",
      member: i.member || false,
      wasMember: i.wasMember || false,
      pubkey: i.pubkey,
      uid: i.uid || "",
      buid: i.buid || "",
      sig: i.sig || "",
      revocation_sig: i.revocation_sig,
      revoked: i.revoked,
      revoked_on: i.revoked_on ? 1 : 0
    }))
    const members:IdentityForRequirements[] = (await this.server.dal.iindexDAL.query(
      'SELECT i.*, count(c.sig) as nbSig ' +
      'FROM i_index i, cert c ' +
      'WHERE c.`to` = i.pub group by i.pub having nbSig >= ?',
      [minsig])).map((i:IindexEntry):IdentityForRequirements => {
        return {
          hash: i.hash || "",
          member: i.member || false,
          wasMember: i.wasMember || false,
          pubkey: i.pub,
          uid: i.uid || "",
          buid: i.created_on || "",
          sig: i.sig || "",
          revocation_sig: "",
          revoked: false,
          revoked_on: 0
        }
      })
    identities = identities.concat(members)
    const all = await this.BlockchainService.requirementsOfIdentities(identities, false);
    if (!all || !all.length) {
      throw BMAConstants.ERRORS.NO_IDTY_MATCHING_PUB_OR_UID;
    }
    return {
      identities: all
    };
  }

  async certifiedBy(req:any): Promise<HttpCertifications> {
    const search = await ParametersService.getSearchP(req);
    const idty = (await this.server.dal.getWrittenIdtyByPubkeyOrUIdForHashingAndIsMember(search)) as FullIindexEntry
    const certs = await this.server.dal.certsFrom(idty.pub);
    const theCerts:HttpCertification[] = [];
    for (const cert of certs) {
      const certified = await this.server.dal.getWrittenIdtyByPubkeyForUidAndMemberAndCreatedOn(cert.to);
      if (certified) {
        let certBlock = await this.server.dal.getBlock(cert.block_number)
        theCerts.push({
          pubkey: cert.to,
          uid: certified.uid,
          isMember: certified.member,
          wasMember: true, // a member is necessarily certified by members
          cert_time: {
            block: certBlock.number,
            medianTime: certBlock.medianTime
          },
          sigDate: certified.created_on,
          written: (cert.written_block !== null && cert.written_hash) ? {
            number: cert.written_block,
            hash: cert.written_hash
          } : null,
          signature: cert.sig
        })
      }
    }
    return {
      pubkey: idty.pub,
      uid: idty.uid,
      sigDate: idty.created_on,
      isMember: idty.member,
      certifications: theCerts
    }
  }

  async identityOf(req:any): Promise<HttpSimpleIdentity> {
    let search = await ParametersService.getSearchP(req);
    const idty = await this.server.dal.getWrittenIdtyByPubkeyOrUIdForHashingAndIsMember(search)
    if (!idty) {
      throw constants.ERRORS.NO_MEMBER_MATCHING_PUB_OR_UID;
    }
    if (!idty.member) {
      throw 'Not a member';
    }
    return {
      pubkey: idty.pub,
      uid: idty.uid,
      sigDate: idty.created_on
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

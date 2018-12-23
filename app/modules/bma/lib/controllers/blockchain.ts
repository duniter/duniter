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

import {Server} from "../../../../../server"
import {AbstractController} from "./AbstractController"
import {ParametersService} from "../parameters"
import {BMAConstants} from "../constants"
import {MembershipDTO} from "../../../../lib/dto/MembershipDTO"
import {
  block2HttpBlock,
  HttpBlock,
  HttpBranches,
  HttpDifficulties,
  HttpHardship,
  HttpMembership,
  HttpMemberships,
  HttpMilestonePage,
  HttpParameters,
  HttpStat
} from "../dtos"
import {TransactionDTO} from "../../../../lib/dto/TransactionDTO"
import {DataErrors} from "../../../../lib/common-libs/errors"
import {Underscore} from "../../../../lib/common-libs/underscore"
import * as toJson from "../tojson"

const http2raw         = require('../http2raw');

export class BlockchainBinding extends AbstractController {

  with:any

  constructor(server:Server) {
    super(server)
    this.with = {

      newcomers: this.getStat('newcomers'),
      certs:     this.getStat('certs'),
      joiners:   this.getStat('joiners'),
      actives:   this.getStat('actives'),
      leavers:   this.getStat('leavers'),
      revoked:   this.getStat('revoked'),
      excluded:  this.getStat('excluded'),
      ud:        this.getStat('ud'),
      tx:        this.getStat('tx')
    }
  }

  async parseMembership(req:any): Promise<HttpMembership> {
    const res = await this.pushEntity(req, http2raw.membership, (raw:string) => this.server.writeRawMembership(raw))
    return {
      signature: res.signature,
      membership: {
        version: res.version,
        currency: res.currency,
        issuer: res.issuer,
        membership: res.membership,
        date: res.date || 0,
        sigDate: res.sigDate || 0,
        raw: res.getRaw()
      }
    }
  }

  async parseBlock(req:any): Promise<HttpBlock> {
    const res = await this.pushEntity(req, http2raw.block, (raw:string) => this.server.writeRawBlock(raw))
    return block2HttpBlock(res)
  }

  parameters = async (): Promise<HttpParameters> => {
    const params = await this.server.dal.getParameters()
    return {
      "currency": params.currency,
      "c": params.c,
      "dt": params.dt,
      "ud0": params.ud0,
      "sigPeriod": params.sigPeriod,
      "sigStock": params.sigStock,
      "sigWindow": params.sigWindow,
      "sigValidity": params.sigValidity,
      "sigQty": params.sigQty,
      "idtyWindow": params.idtyWindow,
      "msWindow": params.msWindow,
      "xpercent": params.xpercent,
      "msValidity": params.msValidity,
      "stepMax": params.stepMax,
      "medianTimeBlocks": params.medianTimeBlocks,
      "avgGenTime": params.avgGenTime,
      "dtDiffEval": params.dtDiffEval,
      "percentRot": params.percentRot,
      "udTime0": params.udTime0,
      "udReevalTime0": params.udReevalTime0,
      "dtReeval": params.dtReeval
    }
  }

  private getStat(statName:string): () => Promise<HttpStat> {
    return async () => {
      let stat = await this.server.dal.getStat(statName);
      return { result: toJson.stat(stat) };
    }
  }

  async promoted(req:any): Promise<HttpBlock> {
    const number = await ParametersService.getNumberP(req);
    const promoted = await this.BlockchainService.promoted(number);
    return toJson.block(promoted);
  }

  async blocks(req:any): Promise<HttpBlock[]> {
    const params = ParametersService.getCountAndFrom(req);
    const count = parseInt(params.count);
    const from = parseInt(params.from);
    let blocks: any[] = await this.BlockchainService.blocksBetween(from, count);
    blocks = blocks.map((b:any) => toJson.block(b));
    return blocks.map(b => ({
      version: b.version,
      currency: b.currency,
      number: b.number,
      issuer: b.issuer,
      issuersFrame: b.issuersFrame,
      issuersFrameVar: b.issuersFrameVar,
      issuersCount: b.issuersCount,
      parameters: b.parameters,
      membersCount: b.membersCount,
      monetaryMass: b.monetaryMass,
      powMin: b.powMin,
      time: b.time,
      medianTime: b.medianTime,
      dividend: b.dividend,
      unitbase: b.unitbase,
      hash: b.hash,
      previousHash: b.previousHash,
      previousIssuer: b.previousIssuer,
      identities: b.identities,
      certifications: b.certifications,
      joiners: b.joiners,
      actives: b.actives,
      leavers: b.leavers,
      revoked: b.revoked,
      excluded: b.excluded,
      transactions: b.transactions.map((t:TransactionDTO) => ({
        version: t.version,
        currency: t.currency,
        comment: t.comment,
        locktime: t.locktime,
        signatures: t.signatures,
        outputs: t.outputs,
        inputs: t.inputs,
        unlocks: t.unlocks,
        blockstamp: t.blockstamp,
        blockstampTime: t.blockstampTime,
        issuers: t.issuers,
        hash: t.hash,
      })),
      nonce: b.nonce,
      inner_hash: b.inner_hash,
      signature: b.signature,
      raw: b.raw,
    }))
  }

  async milestones(req: any): Promise<HttpMilestonePage> {
    const page = ParametersService.getPage(req)
    return this.server.milestones(page)
  }

  async current(): Promise<HttpBlock> {
    const current = await this.server.dal.getCurrentBlockOrNull();
    if (!current) throw BMAConstants.ERRORS.NO_CURRENT_BLOCK;
    return toJson.block(current);
  }

  async hardship(req:any): Promise<HttpHardship> {
    let nextBlockNumber = 0;
    const search = await ParametersService.getSearchP(req);
    const idty = await this.server.dal.getWrittenIdtyByPubkeyOrUidForIsMemberAndPubkey(search);
    if (!idty) {
      throw BMAConstants.ERRORS.NO_MATCHING_IDENTITY;
    }
    if (!idty.member) {
      throw BMAConstants.ERRORS.NOT_A_MEMBER;
    }
    const current = await this.BlockchainService.current();
    if (current) {
      nextBlockNumber = current ? current.number + 1 : 0;
    }
    const difficulty = await this.server.getBcContext().getIssuerPersonalizedDifficulty(idty.pub);
    return {
      "block": nextBlockNumber,
      "level": difficulty
    };
  }

  async difficulties(): Promise<HttpDifficulties> {
    const current = await this.server.dal.getCurrentBlockOrNull()
    if (!current) {
      throw Error(DataErrors[DataErrors.BLOCKCHAIN_NOT_INITIALIZED_YET])
    }
    const number = (current && current.number) || 0;
    const issuers = await this.server.dal.getUniqueIssuersBetween(number - 1 - current.issuersFrame, number - 1);
    const difficulties = [];
    for (const issuer of issuers) {
      const member = await this.server.dal.getWrittenIdtyByPubkeyForUidAndPubkey(issuer);
      const difficulty = await this.server.getBcContext().getIssuerPersonalizedDifficulty(member.pub);
      difficulties.push({
        uid: member.uid,
        level: difficulty
      });
    }
    return {
      "block": number + 1,
      "levels": Underscore.sortBy(difficulties, (diff:any) => diff.level)
    };
  }

  async memberships(req:any): Promise<HttpMemberships> {
    const search = await ParametersService.getSearchP(req);
    const { idty, memberships } = await this.IdentityService.findMember(search);
    const json = {
      pubkey: idty.pubkey,
      uid: idty.uid,
      sigDate: idty.buid,
      memberships: memberships.map((msObj:any) => {
        const ms = MembershipDTO.fromJSONObject(msObj);
        return {
          version: ms.version,
          currency: this.conf.currency,
          membership: ms.membership,
          blockNumber: ms.block_number,
          blockHash: ms.block_hash,
          written: (!msObj.written_number && msObj.written_number !== 0) ? null : msObj.written_number
        };
      })
    }
    json.memberships = Underscore.sortBy(json.memberships, 'blockNumber')
    json.memberships.reverse();
    return json;
  }

  async branches(): Promise<HttpBranches> {
    const branches = await this.BlockchainService.branches();
    const blocks = branches.map((b) => toJson.block(b));
    return {
      blocks: blocks
    };
  }
}

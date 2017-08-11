"use strict";
import {Server} from "../../../../../server";
import {AbstractController} from "./AbstractController";
import {ParametersService} from "../parameters";
import {BMAConstants} from "../constants";
import {MembershipDTO} from "../../../../lib/dto/MembershipDTO";
import {
  block2HttpBlock, HttpBlock, HttpBranches, HttpDifficulties, HttpHardship, HttpMembership, HttpMemberships,
  HttpParameters, HttpStat
} from "../dtos";

const _                = require('underscore');
const http2raw         = require('../http2raw');
const toJson = require('../tojson');

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

  parameters = (): Promise<HttpParameters> => this.server.dal.getParameters();

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
    let blocks = await this.BlockchainService.blocksBetween(from, count);
    blocks = blocks.map((b:any) => toJson.block(b));
    return blocks;
  }

  async current(): Promise<HttpBlock> {
    const current = await this.server.dal.getCurrentBlockOrNull();
    if (!current) throw BMAConstants.ERRORS.NO_CURRENT_BLOCK;
    return toJson.block(current);
  }

  async hardship(req:any): Promise<HttpHardship> {
    let nextBlockNumber = 0;
    const search = await ParametersService.getSearchP(req);
    const idty = await this.IdentityService.findMemberWithoutMemberships(search);
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
    const difficulty = await this.server.getBcContext().getIssuerPersonalizedDifficulty(idty.pubkey);
    return {
      "block": nextBlockNumber,
      "level": difficulty
    };
  }

  async difficulties(): Promise<HttpDifficulties> {
    const current = await this.server.dal.getCurrentBlockOrNull();
    const number = (current && current.number) || 0;
    const issuers = await this.server.dal.getUniqueIssuersBetween(number - 1 - current.issuersFrame, number - 1);
    const difficulties = [];
    for (const issuer of issuers) {
      const member = await this.server.dal.getWrittenIdtyByPubkey(issuer);
      const difficulty = await this.server.getBcContext().getIssuerPersonalizedDifficulty(member.pubkey);
      difficulties.push({
        uid: member.uid,
        level: difficulty
      });
    }
    return {
      "block": number + 1,
      "levels": _.sortBy(difficulties, (diff:any) => diff.level)
    };
  }

  async memberships(req:any): Promise<HttpMemberships> {
    const search = await ParametersService.getSearchP(req);
    const idty:any = await this.IdentityService.findMember(search);
    const json = {
      pubkey: idty.pubkey,
      uid: idty.uid,
      sigDate: idty.buid,
      memberships: idty.memberships.map((msObj:any) => {
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
    json.memberships = _.sortBy(json.memberships, 'blockNumber');
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

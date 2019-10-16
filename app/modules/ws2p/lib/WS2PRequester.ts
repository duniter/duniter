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

import {WS2PConnection} from "./WS2PConnection"
import {BlockDTO} from "../../../lib/dto/BlockDTO"
import {PeerDTO} from "../../../lib/dto/PeerDTO"
import {HttpMilestonePage} from "../../bma/lib/dtos"

export enum WS2P_REQ {
  KNOWN_PEERS,
  PEER_DOCUMENT,
  WOT_REQUIREMENTS_OF_PENDING,
  BLOCKS_CHUNK,
  BLOCK_BY_NUMBER,
  CURRENT,
  MILESTONES_PAGE,
  MILESTONES
}

export class WS2PRequester {

  private constructor(
    protected ws2pc:WS2PConnection) {}

  static fromConnection(ws2pc:WS2PConnection) {
    return new WS2PRequester(ws2pc)
  }

  getPeer(): Promise<PeerDTO> {
    return this.query(WS2P_REQ.PEER_DOCUMENT)
  }

  getPeers(): Promise<PeerDTO[]> {
    return this.query(WS2P_REQ.KNOWN_PEERS)
  }

  getCurrent(): Promise<BlockDTO> {
    return this.query(WS2P_REQ.CURRENT)
  }

  getMilestonesPage(): Promise<HttpMilestonePage> {
    return this.query(WS2P_REQ.MILESTONES_PAGE)
  }

  getMilestones(page: number): Promise<HttpMilestonePage> {
    return this.query(WS2P_REQ.MILESTONES, { page })
  }

  getBlock(number:number): Promise<BlockDTO> {
    return this.query(WS2P_REQ.BLOCK_BY_NUMBER, { number })
  }

  getBlocks(count:number, fromNumber:number): Promise<BlockDTO[]> {
    return this.query(WS2P_REQ.BLOCKS_CHUNK, { count, fromNumber })
  }

  getPubkey() {
    return this.ws2pc.pubkey || "########"
  }

  async getRequirementsPending(minCert = 1): Promise<any> {
    return this.query(WS2P_REQ.WOT_REQUIREMENTS_OF_PENDING, { minCert })
  }

  private query(req:WS2P_REQ, params:any = {}): Promise<any> {
    return this.ws2pc.request({
      name: WS2P_REQ[req],
      params: params
    })
  }

  get hostName() {
    return this.ws2pc.hostName
  }
}
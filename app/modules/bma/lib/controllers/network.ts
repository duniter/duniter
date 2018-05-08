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

import {AbstractController} from "./AbstractController"
import {BMAConstants} from "../constants"
import {HttpMerkleOfPeers, HttpPeer, HttpPeers, HttpWS2PHeads, HttpWS2PInfo} from "../dtos"
import {WS2PHead} from "../../../ws2p/lib/WS2PCluster"
import {DBPeer} from "../../../../lib/db/DBPeer"

const http2raw         = require('../http2raw');

export class NetworkBinding extends AbstractController {

  async peer(): Promise<HttpPeer> {
    const p = await this.PeeringService.peer();
    if (!p) {
      throw BMAConstants.ERRORS.SELF_PEER_NOT_FOUND;
    }
    return p.json();
  }

  async peersGet(req:any): Promise<HttpMerkleOfPeers> {
    let merkle = await this.server.dal.merkleForPeers();
    return await this.MerkleService(req, merkle, async (hashes:string[]) => {
      try {
        let peers = await this.server.dal.findPeersWhoseHashIsIn(hashes);
        const map:any = {};
        peers.forEach((peer:any) => {
          map[peer.hash] = peer;
        });
        if (peers.length == 0) {
          throw BMAConstants.ERRORS.PEER_NOT_FOUND;
        }
        return map;
      } catch (e) {
        throw e;
      }
    })
  }

  async peersPost(req:any): Promise<HttpPeer> {
    const peerDTO = await this.pushEntity(req, http2raw.peer, (raw:string) => this.server.writeRawPeer(raw))
    return {
      version: peerDTO.version,
      currency: peerDTO.currency,
      pubkey: peerDTO.pubkey,
      block: peerDTO.blockstamp,
      endpoints: peerDTO.endpoints,
      signature: peerDTO.signature,
      raw: peerDTO.getRaw()
    }
  }

  async peers(): Promise<HttpPeers> {
    let peers = await this.server.dal.listAllPeers();
    return {
      peers: peers.map(p => DBPeer.json(p))
    }
  }

  async ws2pInfo(): Promise<HttpWS2PInfo> {
    const cluster = this.server.ws2pCluster
    let level1 = 0
    let level2 = 0
    if (cluster) {
      level1 = await cluster.clientsCount()
      level2 = await cluster.servedCount()
    }
    return {
      peers: {
        level1,
        level2
      }
    };
  }

  async ws2pHeads(): Promise<HttpWS2PHeads> {
    const cluster = this.server.ws2pCluster
    let heads: WS2PHead[] = []
    if (cluster) {
      heads = await cluster.getKnownHeads()
    }
    return { heads }
  }
}

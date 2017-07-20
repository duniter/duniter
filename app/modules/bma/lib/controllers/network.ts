import {AbstractController} from "./AbstractController"
import {BMAConstants} from "../constants"

const _                = require('underscore');
const http2raw         = require('../http2raw');

export class NetworkBinding extends AbstractController {

  async peer() {
    const p = await this.PeeringService.peer();
    if (!p) {
      throw BMAConstants.ERRORS.SELF_PEER_NOT_FOUND;
    }
    return p.json();
  }

  async peersGet(req:any) {
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

  peersPost(req:any) {
    return this.pushEntity(req, http2raw.peer, BMAConstants.ENTITY_PEER)
  }

  async peers() {
    let peers = await this.server.dal.listAllPeers();
    return {
      peers: peers.map((p:any) => {
        return _.pick(p,
          'version',
          'currency',
          'status',
          'first_down',
          'last_try',
          'pubkey',
          'block',
          'signature',
          'endpoints');
      })
    };
  }
}

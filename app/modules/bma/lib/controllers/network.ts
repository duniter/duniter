import {AbstractController} from "./AbstractController";
import {BMAConstants} from "../constants";
import {HttpMerkleOfPeers, HttpPeer, HttpPeers, HttpWS2PInfo} from "../dtos";
import {WS2PDependency} from "../../../ws2p/index"

const _                = require('underscore');
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
}

import * as stream from "stream"
import {PeeringService} from "../../service/PeeringService"
import {FileDAL} from "../dal/fileDAL"
import {DBPeer} from "../dal/sqliteDAL/PeerDAL"
import {PeerDTO} from "../dto/PeerDTO"

const constants = require('../constants');

export class RouterStream extends stream.Transform {

  logger:any
  active = true

  constructor(private peeringService:PeeringService, private dal:FileDAL) {
    super({ objectMode: true })

    this.logger = require('../logger').NewLogger('router')
  }
  
  setConfDAL(theDAL:FileDAL) {
    this.dal = theDAL
  }

  setActive(shouldBeActive:boolean) {
    this.active = shouldBeActive
  }

  async _write(obj:any, enc:any, done:any) {
    try {
      if (obj.joiners) {
        await this.route('block', obj, () => this.getRandomInUPPeers(obj.issuer === this.peeringService.pubkey)());
      }
      else if (obj.revocation) {
        await this.route('revocation', obj, () => this.getRandomInUPPeers(obj.pubkey === this.peeringService.pubkey)());
      }
      else if (obj.pubkey && obj.uid) {
        await this.route('identity', obj, () => this.getRandomInUPPeers(obj.pubkey === this.peeringService.pubkey)());
      }
      else if (obj.idty_uid) {
        await this.route('cert', obj, () => this.getRandomInUPPeers(obj.pubkey === this.peeringService.pubkey)());
      }
      else if (obj.userid) {
        await this.route('membership', obj, () => this.getRandomInUPPeers(obj.issuer === this.peeringService.pubkey)());
      }
      else if (obj.inputs) {
        await this.route('transaction', obj, () => this.getRandomInUPPeers(obj.issuers.indexOf(this.peeringService.pubkey) !== -1)());
      }
      else if (obj.endpoints) {
        await this.route('peer', obj, () => this.getRandomInUPPeers(obj.pubkey === this.peeringService.pubkey)());
      }
      else if (obj.from && obj.from == this.peeringService.pubkey) {
        // Route ONLY status emitted by this node
        await this.route('status', obj, () => this.getTargeted(obj.to || obj.idty_issuer)());
      }
      else if (obj.unreachable) {
        await this.dal.setPeerDown(obj.peer.pubkey);
        this.logger.info("Peer %s unreachable: now considered as DOWN.", obj.peer.pubkey);
      }
      else if (obj.outdated) {
        await this.peeringService.handleNewerPeer(obj.peer);
      }
    } catch (e) {
      if (e && e.uerr && e.uerr.ucode == constants.ERRORS.NEWER_PEER_DOCUMENT_AVAILABLE.uerr.ucode) {
        this.logger.info('Newer peer document available on the network for local node');
      } else {
        this.logger.error("Routing error: %s", e && (e.stack || e.message || (e.uerr && e.uerr.message) || e));
      }
    }
    done && done();
  }

  private async route(type:string, obj:any, getPeersFunc:any) {
    if (!this.active) return;
    const peers = await getPeersFunc();
    this.push({
      'type': type,
      'obj': obj,
      'peers': (peers || []).map((p:any) => PeerDTO.fromJSONObject(p))
    })
  }

  private getRandomInUPPeers (isSelfDocument:boolean): () => Promise<any> {
    return this.getValidUpPeers([this.peeringService.pubkey], isSelfDocument);
  }

  private getValidUpPeers (without:any, isSelfDocument:boolean) {
    return async () => {
      let members:DBPeer[] = [];
      let nonmembers:DBPeer[] = [];
      let peers = await this.dal.getRandomlyUPsWithout(without); // Peers with status UP
      for (const p of peers) {
        let isMember = await this.dal.isMember(p.pubkey);
        isMember ? members.push(p) : nonmembers.push(p);
      }
      members = RouterStream.chooseXin(members, isSelfDocument ? constants.NETWORK.MAX_MEMBERS_TO_FORWARD_TO_FOR_SELF_DOCUMENTS : constants.NETWORK.MAX_MEMBERS_TO_FORWARD_TO);
      nonmembers = RouterStream.chooseXin(nonmembers,  isSelfDocument ? constants.NETWORK.MAX_NON_MEMBERS_TO_FORWARD_TO_FOR_SELF_DOCUMENTS : constants.NETWORK.MAX_NON_MEMBERS_TO_FORWARD_TO);
      let mainRoutes:any = members.map((p:any) => (p.member = true) && p).concat(nonmembers);
      let mirrors = await this.peeringService.mirrorBMAEndpoints();
      const peersToRoute:DBPeer[] = mainRoutes.concat(mirrors.map((mep, index) => { return {
        pubkey: 'M' + index + '_' + this.peeringService.pubkey,
        endpoints: [mep]
      }}));
      return peersToRoute.map(p => PeerDTO.fromJSONObject(p))
    }
  }

  /**
  * Get the peer targeted by `to` argument, this node excluded (for not to loop on self).
  */
  private getTargeted(to:string) {
    return async () => {
      if (to == this.peeringService.pubkey) {
        return [];
      }
      const peer = await this.dal.getPeer(to);
      return [peer];
    };
  }

  static chooseXin(peers:DBPeer[], max:number) {
    const chosen:DBPeer[] = [];
    const nbPeers = peers.length;
    for (let i = 0; i < Math.min(nbPeers, max); i++) {
      const randIndex = Math.max(Math.floor(Math.random() * 10) - (10 - nbPeers) - i, 0);
      chosen.push(peers[randIndex]);
      peers.splice(randIndex, 1);
    }
    return chosen;
  }
}

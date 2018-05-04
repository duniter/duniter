import {LokiCollectionManager} from "./LokiCollectionManager"
import {PeerDAO} from "../abstract/PeerDAO"
import {DBPeer} from "../../sqliteDAL/PeerDAL"

export class LokiPeer extends LokiCollectionManager<DBPeer> implements PeerDAO {

  constructor(loki:any) {
    super(loki, 'peer', ['pubkey'])
  }

  cleanCache(): void {
  }

  async listAll(): Promise<DBPeer[]> {
    return this.collection
      .find({})
  }

  async withUPStatus(): Promise<DBPeer[]> {
    return this.collection
      .find({ status: 'UP' })
  }

  async getPeer(pubkey: string): Promise<DBPeer> {
    return this.collection
      .find({ pubkey })[0]
  }

  async insertBatch(peers: DBPeer[]): Promise<void> {
    for (const p of peers) {
      this.collection.insert(p)
    }
  }

  async savePeer(peer: DBPeer): Promise<DBPeer> {
    let updated = false
    this.collection
      .chain()
      .find({ pubkey: peer.pubkey })
      .update(p => {
        p.version = peer.version
        p.currency = peer.currency
        p.status = peer.status
        p.statusTS = peer.statusTS
        p.hash = peer.hash
        p.first_down = peer.first_down
        p.last_try = peer.last_try
        p.pubkey = peer.pubkey
        p.block = peer.block
        p.signature = peer.signature
        p.endpoints = peer.endpoints
        p.raw = peer.raw
        updated = true
      })
    if (!updated) {
      await this.insertBatch([peer])
    }
    return peer
  }

  async removePeerByPubkey(pubkey:string): Promise<void> {
    this.collection
      .chain()
      .find({ pubkey })
      .remove()
  }

  async removePeersDownBefore(thresholdTime:number): Promise<void> {
    this.collection
      .chain()
      .find({
        $and: [
          { first_down: { $lt: thresholdTime } },
          { first_down: { $gt: 0 } },
        ]
      })
      .remove()
  }

  async removeAll(): Promise<void> {
    this.collection
      .chain()
      .find({})
      .remove()
  }

  async getPeersWithEndpointsLike(ep: string): Promise<DBPeer[]> {
    return this.collection
      .chain()
      .find({})
      .where(p => p.endpoints.filter(ep => ep.indexOf(ep) !== -1).length > 0)
      .data()
  }
}
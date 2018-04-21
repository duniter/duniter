import {FullMindexEntry, Indexer, MindexEntry} from "../../../indexer"
import {MIndexDAO} from "../abstract/MIndexDAO"
import {LokiPubkeySharingIndex} from "./LokiPubkeySharingIndex"

export class LokiMIndex extends LokiPubkeySharingIndex<MindexEntry> implements MIndexDAO {

  constructor(loki:any) {
    super(loki, 'mindex', ['pub'])
  }

  async findByPubAndChainableOnGt(pub: string, medianTime: number): Promise<MindexEntry[]> {
    return this.collection
      .find({
        $and: [
          { pub },
          { chainable_on: { $gt: medianTime } },
        ]
      })
  }

  async findExpiresOnLteAndRevokesOnGt(medianTime: number): Promise<MindexEntry[]> {
    return this.collection
      .find({
        $and: [
          { expires_on: { $lte: medianTime } },
          { revokes_on: { $gt: medianTime } },
        ]
      })
  }

  async findRevokesOnLteAndRevokedOnIsNull(medianTime: number): Promise<MindexEntry[]> {
    return this.collection
      .find({
        $and: [
          { revokes_on: { $lte: medianTime } },
          { revoked_on: null },
        ]
      })
  }

  async getReducedMS(pub: string): Promise<FullMindexEntry | null> {
    const reducable = await this.reducable(pub)
    if (reducable.length) {
      return Indexer.DUP_HELPERS.reduce(reducable)
    }
    return null
  }

  async getRevokedPubkeys(): Promise<string[]> {
    return this.collection
      .find({ revoked_on: { $gt: 0 } })
      // We map
      .map(r => r.pub)
  }

  async reducable(pub: string): Promise<MindexEntry[]> {
    return this.collection.chain()
      .find({ pub })
      .simplesort('writtenOn')
      .data()
  }

}

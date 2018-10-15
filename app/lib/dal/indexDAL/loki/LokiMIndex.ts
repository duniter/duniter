import {FullMindexEntry, Indexer, MindexEntry, reduceBy} from "../../../indexer"
import {MIndexDAO} from "../abstract/MIndexDAO"
import {LokiPubkeySharingIndex} from "./LokiPubkeySharingIndex"
import {MonitorExecutionTime} from "../../../debug/MonitorExecutionTime"

export class LokiMIndex extends LokiPubkeySharingIndex<MindexEntry> implements MIndexDAO {

  constructor(loki:any) {
    super(loki, 'mindex', ['pub'])
  }

  @MonitorExecutionTime()
  async findByPubAndChainableOnGt(pub: string, medianTime: number): Promise<MindexEntry[]> {
    return this.collection
      .find({
        $and: [
          { pub },
          { chainable_on: { $gt: medianTime } },
        ]
      })
  }

  @MonitorExecutionTime()
  async findExpiresOnLteAndRevokesOnGt(medianTime: number): Promise<MindexEntry[]> {
    return this.collection
      .find({
        $and: [
          { expires_on: { $lte: medianTime } },
          { revokes_on: { $gt: medianTime } },
        ]
      })
  }

  @MonitorExecutionTime()
  async findRevokesOnLteAndRevokedOnIsNull(medianTime: number): Promise<MindexEntry[]> {
    return this.collection
      .find({
        $and: [
          { revokes_on: { $lte: medianTime } },
          { revoked_on: null },
        ]
      })
  }
  @MonitorExecutionTime()
  async getReducedMS(pub: string): Promise<FullMindexEntry | null> {
    const reducable = (await this.reducable(pub)) as (FullMindexEntry)[]
    if (reducable.length) {
      return Indexer.DUP_HELPERS.reduce(reducable)
    }
    return null
  }

  @MonitorExecutionTime()
  async getReducedMSForImplicitRevocation(pub: string): Promise<FullMindexEntry | null> {
    const reducable = (await this.reducable(pub)) as (FullMindexEntry)[]
    if (reducable.length) {
      return Indexer.DUP_HELPERS.reduce(reducable)
    }
    return null
  }

  @MonitorExecutionTime()
  async getReducedMSForMembershipExpiry(pub: string): Promise<FullMindexEntry | null> {
    const reducable = (await this.reducable(pub)) as (FullMindexEntry)[]
    if (reducable.length) {
      return Indexer.DUP_HELPERS.reduce(reducable)
    }
    return null
  }

  async findPubkeysThatShouldExpire(medianTime: number): Promise<{ pub: string; created_on: string }[]> {
    const results: { pub: string; created_on: string }[] = []
    const memberships: MindexEntry[] = reduceBy(await this.findExpiresOnLteAndRevokesOnGt(medianTime), ['pub'])
    for (const POTENTIAL of memberships) {
      const MS = await this.getReducedMS(POTENTIAL.pub) as FullMindexEntry // We are sure because `memberships` already comes from the MINDEX
      const hasRenewedSince = MS.expires_on > medianTime;
      if (!MS.expired_on && !hasRenewedSince) {
        results.push({
          pub: MS.pub,
          created_on: MS.created_on,
        })
      }
    }
    return results
  }

  @MonitorExecutionTime()
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

import {FullIindexEntry, IindexEntry, Indexer} from "../../../indexer"
import {IIndexDAO} from "../abstract/IIndexDAO"
import {LokiPubkeySharingIndex} from "./LokiPubkeySharingIndex"
import {OldIindexEntry} from "../../../db/OldIindexEntry"
import {MonitorExecutionTime} from "../../../debug/MonitorExecutionTime"
import {OldTransformers} from "../common/OldTransformer"

export class LokiIIndex extends LokiPubkeySharingIndex<IindexEntry> implements IIndexDAO {

  constructor(loki:any) {
    super(loki, 'iindex', [
      'pub',
      'uid',
      'member',
    ])
  }

  @MonitorExecutionTime()
  async reducable(pub: string): Promise<IindexEntry[]> {
    return this.findByPub(pub)
  }

  @MonitorExecutionTime()
  async findByPub(pub: string): Promise<IindexEntry[]> {
    return this.collection.chain()
      .find({ pub })
      .simplesort('writtenOn')
      .data()
  }

  @MonitorExecutionTime()
  async findByUid(uid: string): Promise<IindexEntry[]> {
    return this.collection.chain()
      .find({ uid })
      .simplesort('writtenOn')
      .data()
  }

  @MonitorExecutionTime()
  async getMembers(): Promise<{ pubkey: string; uid: string|null }[]> {
    return this.collection
      // Those who are still marked member somewhere
      .find({ member: true })
      // We reduce them
      .map(r => {
        return Indexer.DUP_HELPERS.reduce(
          this.collection
            .chain()
            .find({ pub: r.pub })
            .simplesort('writtenOn')
            .data()
        )
      })
      // We keep only the real members (because we could have excluded)
      .filter(r => r.member)
      // We map
      .map(OldTransformers.toOldIindexEntry)
  }

  @MonitorExecutionTime()
  async getFromPubkey(pub: string): Promise<FullIindexEntry | null> {
    return this.retrieveIdentityOnPubOrNull(
      { pub }
    ) as Promise<FullIindexEntry|null>
  }

  @MonitorExecutionTime()
  async getFromUID(uid: string): Promise<FullIindexEntry | null> {
    return this.retrieveIdentityOnPubOrNull(
      this.collection
        .chain()
        .find({ uid })
        .data()[0]
    ) as Promise<FullIindexEntry|null>
  }

  @MonitorExecutionTime()
  async getFromPubkeyOrUid(search: string): Promise<FullIindexEntry | null> {
    const idty = await this.getFromPubkey(search)
    if (idty) {
      return idty
    }
    return this.getFromUID(search) as Promise<FullIindexEntry|null>
  }

  @MonitorExecutionTime()
  async searchThoseMatching(search: string): Promise<OldIindexEntry[]> {
    const reducables = Indexer.DUP_HELPERS.reduceBy(this.collection
      .chain()
      .find({
        $or: [
          { pub: { $contains: search } },
          { uid: { $contains: search } },
        ]
      })
      .data()
    , ['pub'])
    // We get the full representation for each member
    return await Promise.all(reducables.map(async (entry) => {
      return OldTransformers.toOldIindexEntry(Indexer.DUP_HELPERS.reduce(await this.reducable(entry.pub)))
    }))
  }

  @MonitorExecutionTime()
  async getFullFromUID(uid: string): Promise<FullIindexEntry> {
    return (await this.getFromUID(uid)) as FullIindexEntry
  }

  @MonitorExecutionTime()
  async getFullFromPubkey(pub: string): Promise<FullIindexEntry> {
    return (await this.getFromPubkey(pub)) as FullIindexEntry
  }

  @MonitorExecutionTime()
  async getFullFromHash(hash: string): Promise<FullIindexEntry> {
    return this.retrieveIdentityOnPubOrNull(
      this.collection
        .chain()
        .find({ hash })
        .data()[0]
    ) as Promise<FullIindexEntry>
  }

  @MonitorExecutionTime()
  async retrieveIdentityOnPubOrNull(entry:{ pub:string }|null) {
    if (!entry) {
      return null
    }
    return OldTransformers.iindexEntityOrNull(
      this.collection
        .chain()
        .find({ pub: entry.pub })
        .simplesort('writtenOn')
        .data()
    ) as Promise<FullIindexEntry|null>
  }

  @MonitorExecutionTime()
  async getToBeKickedPubkeys(): Promise<string[]> {
    return this.collection
    // Those who are still marked member somewhere
      .find({ kick: true })
      // We reduce them
      .map(r => {
        return Indexer.DUP_HELPERS.reduce(
          this.collection
            .chain()
            .find({ pub: r.pub })
            .simplesort('writtenOn')
            .data()
        )
      })
      // We keep only the real members (because we could have excluded)
      .filter(r => r.kick)
      // We map
      .map(r => r.pub)
  }
}

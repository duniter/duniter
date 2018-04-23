import {FullIindexEntry, IindexEntry, Indexer} from "../../../indexer"
import {IIndexDAO} from "../abstract/IIndexDAO"
import {OldIindexEntry} from "../../sqliteDAL/index/IIndexDAL"
import {LokiPubkeySharingIndex} from "./LokiPubkeySharingIndex"

export class LokiIIndex extends LokiPubkeySharingIndex<IindexEntry> implements IIndexDAO {

  constructor(loki:any) {
    super(loki, 'iindex', [
      'pub',
      'uid',
      'member',
    ])
  }

  reducable(pub: string): Promise<IindexEntry[]> {
    return this.findByPub(pub)
  }

  async findAllByWrittenOn(): Promise<IindexEntry[]> {
    return this.collection.chain()
      .find({})
      .simplesort('writtenOn')
      .data()
  }

  async findByPub(pub: string): Promise<IindexEntry[]> {
    return this.collection.chain()
      .find({ pub })
      .simplesort('writtenOn')
      .data()
  }

  async findByUid(uid: string): Promise<IindexEntry[]> {
    return this.collection.chain()
      .find({ uid })
      .simplesort('writtenOn')
      .data()
  }

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
      .map(this.toCorrectEntity)
  }

  async getFromPubkey(pub: string): Promise<FullIindexEntry | null> {
    return this.retrieveIdentityOnPubOrNull(
      { pub }
    ) as Promise<FullIindexEntry|null>
  }

  async getFromUID(uid: string): Promise<FullIindexEntry | null> {
    return this.retrieveIdentityOnPubOrNull(
      this.collection
        .chain()
        .find({ uid })
        .data()[0]
    ) as Promise<FullIindexEntry|null>
  }

  async getFromPubkeyOrUid(search: string): Promise<FullIindexEntry | null> {
    const idty = await this.getFromPubkey(search)
    if (idty) {
      return idty
    }
    return this.getFromUID(search) as Promise<FullIindexEntry|null>
  }

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
      return this.toCorrectEntity(Indexer.DUP_HELPERS.reduce(await this.reducable(entry.pub)))
    }))
  }

  async getFullFromUID(uid: string): Promise<FullIindexEntry> {
    return (await this.getFromUID(uid)) as FullIindexEntry
  }

  async getFullFromPubkey(pub: string): Promise<FullIindexEntry> {
    return (await this.getFromPubkey(pub)) as FullIindexEntry
  }

  async getFullFromHash(hash: string): Promise<FullIindexEntry> {
    return this.retrieveIdentityOnPubOrNull(
      this.collection
        .chain()
        .find({ hash })
        .data()[0]
    ) as Promise<FullIindexEntry>
  }

  async retrieveIdentityOnPubOrNull(entry:{ pub:string }|null) {
    if (!entry) {
      return null
    }
    return this.entityOrNull(
      this.collection
        .chain()
        .find({ pub: entry.pub })
        .simplesort('writtenOn')
        .data()
    ) as Promise<FullIindexEntry|null>
  }

  async getMembersPubkeys(): Promise<{ pub: string }[]> {
    return (await this.getMembers()).map(m => ({ pub: m.pubkey }))
  }

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

  private async entityOrNull(reducable:IindexEntry[]) {
    if (reducable.length) {
      return this.toCorrectEntity(Indexer.DUP_HELPERS.reduce(reducable))
    }
    return null
  }

  private toCorrectEntity(row:IindexEntry): OldIindexEntry {
    // Old field
    return {
      pubkey: row.pub,
      pub: row.pub,
      buid: row.created_on,
      revocation_sig: null,
      uid: row.uid,
      hash: row.hash,
      sig: row.sig,
      created_on: row.created_on,
      member: row.member,
      wasMember: row.wasMember,
      kick: row.kick,
      wotb_id: row.wotb_id,
      age: row.age,
      index: row.index,
      op: row.op,
      writtenOn: row.writtenOn,
      written_on: row.written_on
    }
  }
}

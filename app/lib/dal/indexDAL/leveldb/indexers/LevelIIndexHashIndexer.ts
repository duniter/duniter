import {LevelDBDataIndex} from "../generic/LevelDBDataIndex"
import {IindexEntry} from "../../../../indexer"

export type Hash = string
export type Pubkey = string

export class LevelIIndexHashIndexer extends LevelDBDataIndex<Pubkey[], IindexEntry> {

  async onInsert(records: IindexEntry[]): Promise<void> {
    await Promise.all(records
      .filter(e => e.op === 'CREATE' && e.hash)
      .map(async e => this.put(e.hash as string, [e.pub]))
    )
  }

  async onRemove(records: IindexEntry[]): Promise<void> {
    await Promise.all(records
      .filter(e => e.op === 'CREATE' && e.hash)
      .map(async e => this.del(e.hash as string))
    )
  }

  async getByHash(hash: Hash): Promise<Pubkey|null> {
    const res = await this.getOrNull(hash)
    return res && res[0]
  }
}

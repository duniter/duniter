import { LevelDBDataIndex } from "../generic/LevelDBDataIndex";
import { IindexEntry } from "../../../../indexer";

export type Uid = string;
export type Pubkey = string;

export class LevelIIndexUidIndexer extends LevelDBDataIndex<
  Pubkey[],
  IindexEntry
> {
  async onInsert(records: IindexEntry[]): Promise<void> {
    await Promise.all(
      records
        .filter((e) => e.op === "CREATE" && e.uid)
        .map(async (e) => this.put(e.uid as string, [e.pub]))
    );
  }

  async onRemove(records: IindexEntry[]): Promise<void> {
    await Promise.all(
      records
        .filter((e) => e.op === "CREATE" && e.uid)
        .map(async (e) => this.del(e.uid as string))
    );
  }

  async getPubByUid(uid: Uid): Promise<Pubkey | null> {
    const res = await this.getOrNull(uid);
    return res && res[0];
  }
}

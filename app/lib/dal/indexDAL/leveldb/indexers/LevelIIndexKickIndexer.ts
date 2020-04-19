import { LevelDBDataIndex } from "../generic/LevelDBDataIndex";
import { IindexEntry } from "../../../../indexer";
import { DataErrors } from "../../../../common-libs/errors";

export type Pubkey = string;

export interface KickEntry {
  on: number | undefined; // The next time that the identity must be kicked
  done: number[]; // The revertion history
}

export class LevelIIndexKickIndexer extends LevelDBDataIndex<
  KickEntry,
  IindexEntry
> {
  async onInsert(records: IindexEntry[]): Promise<void> {
    // Case 1: to be kicked
    await Promise.all(
      records
        .filter((e) => e.kick)
        .map(async (e) => {
          let entry = await this.getOrNull(e.pub);
          if (!entry) {
            entry = {
              on: e.writtenOn,
              done: [],
            };
          }
          entry.on = e.writtenOn;
          await this.put(e.pub, entry);
        })
    );
    // Case 2: just kicked
    await Promise.all(
      records
        .filter((e) => e.member === false)
        .map(async (e) => {
          const entry = await this.getOrNull(e.pub);
          if (entry && entry.on === e.writtenOn - 1) {
            // Members are excluded at B# +1
            entry.done.push(entry.on);
            entry.on = undefined;
            await this.put(e.pub, entry);
          }
          // Otherwise it is not a kicking
        })
    );
  }

  async onRemove(records: IindexEntry[]): Promise<void> {
    // Case 1: to be kicked => unkicked
    await Promise.all(
      records
        .filter((e) => e.kick)
        .map(async (e) => {
          const entry = await this.get(e.pub);
          if (entry.on === e.writtenOn) {
            entry.on = entry.done.pop();
            if (entry.on === undefined) {
              // No more kicking left
              await this.del(e.pub);
            }
            // Some kicks left
            await this.put(e.pub, entry); // TODO: test this, can occur, probably not covered
          } else {
            throw Error(
              DataErrors[DataErrors.INVALID_LEVELDB_IINDEX_DATA_TO_BE_KICKED]
            );
          }
        })
    );

    // Case 2: just kicked => to be kicked
    await Promise.all(
      records
        .filter((e) => e.member === false)
        .map(async (e) => {
          const entry = await this.getOrNull(e.pub);
          if (entry && entry.done.includes(e.writtenOn - 1)) {
            // It was a kicking
            entry.on = entry.done.pop();
            if (!entry.on) {
              throw Error(
                DataErrors[DataErrors.INVALID_LEVELDB_IINDEX_DATA_WAS_KICKED]
              );
            }
            await this.put(e.pub, entry);
          }
        })
    );
  }

  async onTrimming(belowNumber: number): Promise<void> {
    await this.applyAllKeyValue(async (kv) => {
      const initialLength = kv.value.done.length;
      kv.value.done = kv.value.done.filter((e) => e >= belowNumber);
      if (kv.value.done.length !== initialLength && kv.value.done.length > 0) {
        // We simply update the entry which was pruned
        await this.put(kv.key, kv.value);
      } else if (
        kv.value.done.length !== initialLength &&
        kv.value.done.length === 0 &&
        !kv.value.on
      ) {
        // We remove the entry, no more necessary
        await this.del(kv.key);
      }
    });
  }

  async getAll(): Promise<Pubkey[]> {
    return this.findWhereTransform(
      (t) => !!t.on,
      (kv) => kv.key
    );
  }
}

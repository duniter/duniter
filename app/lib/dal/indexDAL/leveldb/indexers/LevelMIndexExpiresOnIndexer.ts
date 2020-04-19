import { LevelDBDataIndex } from "../generic/LevelDBDataIndex";
import { MindexEntry, reduce } from "../../../../indexer";
import { reduceConcat, reduceGroupBy } from "../../../../common-libs/reduce";
import { pint } from "../../../../common-libs/pint";
import { Underscore } from "../../../../common-libs/underscore";

export type Pubkey = string;

export class LevelMIndexExpiresOnIndexer extends LevelDBDataIndex<
  Pubkey[],
  MindexEntry
> {
  async onInsert(
    records: MindexEntry[],
    prevState: MindexEntry[]
  ): Promise<void> {
    const prevStateByPub = reduceGroupBy(prevState, "pub");

    // Case 1: expires_on change (when MS JOIN|RENEW)
    const byExpiresOn = reduceGroupBy(
      records.filter((e) => e.expires_on),
      "expires_on"
    );
    await Promise.all(
      Underscore.keys(byExpiresOn).map(async (expiresOn) => {
        const pubkeys = byExpiresOn[expiresOn].map((e) => e.pub);
        // 1. If the key had a previous revokes_on, we remove it
        const reducedWhosExpiresOnChanges = pubkeys
          .filter((p) => prevStateByPub[p])
          .map((p) => reduce(prevStateByPub[p]))
          .filter((r) => r.expires_on && !r.expired_on);
        for (const reduced of reducedWhosExpiresOnChanges) {
          await this.removeAllKeysFromExpiresOn(reduced.expires_on as number, [
            reduced.pub,
          ]);
        }
        // 2. We put the new value
        await this.addAllKeysToExpiresOn(
          pint(expiresOn),
          byExpiresOn[expiresOn].map((e) => e.pub)
        );
      })
    );
    // Case 2: expiration occurs
    const pubkeysToexpire = Underscore.uniq(
      records.filter((e) => e.expired_on).map((r) => r.pub)
    );
    const prevStateFM = Underscore.values(prevStateByPub).map(reduce);
    const byExpiresOnPrevState = reduceGroupBy(
      prevStateFM.filter((r) => pubkeysToexpire.includes(r.pub)),
      "expires_on"
    );
    await Promise.all(
      Underscore.keys(byExpiresOnPrevState).map(async (expiresOn) =>
        this.removeAllKeysFromExpiresOn(
          pint(expiresOn),
          byExpiresOnPrevState[expiresOn].map((e) => e.pub)
        )
      )
    );
  }

  async onRemove(
    records: MindexEntry[],
    newState: MindexEntry[]
  ): Promise<void> {
    const newStateByPub = reduceGroupBy(newState, "pub");

    // Case 1: expires_on change REVERT
    const byExpiresOn = reduceGroupBy(
      records.filter((e) => e.expires_on),
      "expires_on"
    );
    await Promise.all(
      Underscore.keys(byExpiresOn).map(async (expiresOn) => {
        const pubkeys = byExpiresOn[expiresOn].map((e) => e.pub);
        // 1. Remove the existing value
        await this.removeAllKeysFromExpiresOn(pint(expiresOn), pubkeys);
        // 2. Put back the old one if it exists
        const reduced = pubkeys
          .filter((p) => newStateByPub[p])
          .map((p) => newStateByPub[p])
          .map(reduce)
          .filter((r) => r.expires_on);
        for (const r of reduced) {
          await this.addAllKeysToExpiresOn(r.expires_on as number, [r.pub]);
        }
      })
    );
    // Case 2: expiration REVERT
    const values: MindexEntry[] = Underscore.values(
      newStateByPub
    ).map((entries) => reduce(entries));
    const byExpiredOn = reduceGroupBy(values, "expired_on");
    await Promise.all(
      Underscore.keys(byExpiredOn).map(async (expiresOn) =>
        this.addAllKeysToExpiresOn(
          pint(expiresOn),
          byExpiredOn[expiresOn].map((e) => e.pub)
        )
      )
    );
  }

  async addAllKeysToExpiresOn(
    expiresOn: number,
    pubkeys: Pubkey[]
  ): Promise<void> {
    const key = LevelMIndexExpiresOnIndexer.trimKey(expiresOn);
    let entry = await this.getOrNull(key);
    if (!entry) {
      entry = [];
    }
    for (const pub of pubkeys) {
      entry.push(pub);
    }
    await this.put(key, entry);
  }

  async removeAllKeysFromExpiresOn(
    expiresOn: number,
    pubkeys: Pubkey[]
  ): Promise<void> {
    // We remove the "expires_on" indexed values
    const key = LevelMIndexExpiresOnIndexer.trimKey(expiresOn);
    const entry = await this.get(key);
    for (const pub of pubkeys) {
      if (entry.includes(pub)) {
        entry.splice(entry.indexOf(pub), 1);
      }
    }
    if (entry.length) {
      // Some expirations left
      await this.put(key, entry); // TODO: test this, can occur, probably not covered
    } else {
      // No more expirations left
      await this.del(key);
    }
  }

  async findExpiresOnLte(medianTime: number) {
    return (
      await this.findAllValues({
        lte: LevelMIndexExpiresOnIndexer.trimKey(medianTime),
      })
    ).reduce(reduceConcat, []);
  }

  private static trimKey(expiresOn: number) {
    return String(expiresOn).padStart(10, "0");
  }
}

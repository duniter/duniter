import { LevelDBDataIndex } from "../generic/LevelDBDataIndex";
import { MindexEntry, reduce } from "../../../../indexer";
import { reduceConcat, reduceGroupBy } from "../../../../common-libs/reduce";
import { Underscore } from "../../../../common-libs/underscore";
import { pint } from "../../../../common-libs/pint";

export type Pubkey = string;

export class LevelMIndexRevokesOnIndexer extends LevelDBDataIndex<
  Pubkey[],
  MindexEntry
> {
  async onInsert(
    records: MindexEntry[],
    prevState: MindexEntry[]
  ): Promise<void> {
    const prevStateByPub = reduceGroupBy(prevState, "pub");

    // Case 1: revokes_on change (when MS JOIN|RENEW)
    const byRevokesOn = reduceGroupBy(
      records.filter((e) => e.revokes_on),
      "revokes_on"
    );
    await Promise.all(
      Underscore.keys(byRevokesOn).map(async (revokesOn) => {
        const pubkeys = byRevokesOn[revokesOn].map((e) => e.pub);
        // 1. If the key had a previous revokes_on, we remove it
        const reducedWhosRevokesOnChanges = pubkeys
          .filter((p) => prevStateByPub[p])
          .map((p) => reduce(prevStateByPub[p]))
          .filter((r) => r.revokes_on && !r.revoked_on);
        for (const reduced of reducedWhosRevokesOnChanges) {
          await this.removeAllKeysFromRevokesOn(reduced.revokes_on as number, [
            reduced.pub,
          ]);
        }
        // 2. We put the new value
        await this.addAllKeysToRevokesOn(
          pint(revokesOn),
          byRevokesOn[revokesOn].map((e) => e.pub)
        );
      })
    );
    // Case 2: revocation occurs
    const pubkeysToRevoke = Underscore.uniq(
      records.filter((e) => e.revoked_on).map((r) => r.pub)
    );
    const prevStateFM = Underscore.values(prevStateByPub).map(reduce);
    const byRevokesOnPrevState = reduceGroupBy(
      prevStateFM.filter((r) => pubkeysToRevoke.includes(r.pub)),
      "revokes_on"
    );
    await Promise.all(
      Underscore.keys(byRevokesOnPrevState).map(async (revokesOn) =>
        this.removeAllKeysFromRevokesOn(
          pint(revokesOn),
          byRevokesOnPrevState[revokesOn].map((e) => e.pub)
        )
      )
    );
  }

  async onRemove(
    records: MindexEntry[],
    newState: MindexEntry[]
  ): Promise<void> {
    const newStateByPub = reduceGroupBy(newState, "pub");

    // Case 1: revokes_on change REVERT
    const byRevokesOn = reduceGroupBy(
      records.filter((e) => e.revokes_on),
      "revokes_on"
    );
    await Promise.all(
      Underscore.keys(byRevokesOn).map(async (revokesOn) => {
        const pubkeys = byRevokesOn[revokesOn].map((e) => e.pub);
        // 1. Remove the existing value
        await this.removeAllKeysFromRevokesOn(pint(revokesOn), pubkeys);
        // 2. Put back the old one if it exists
        const reduced = pubkeys
          .filter((p) => newStateByPub[p])
          .map((p) => newStateByPub[p])
          .map(reduce)
          .filter((r) => r.revokes_on);
        for (const r of reduced) {
          await this.addAllKeysToRevokesOn(r.revokes_on as number, [r.pub]);
        }
      })
    );
    // Case 2: revocation REVERT
    const values: MindexEntry[] = Underscore.values(
      newStateByPub
    ).map((entries) => reduce(entries));
    const byExpiredOn = reduceGroupBy(values, "revoked_on");
    await Promise.all(
      Underscore.keys(byExpiredOn).map(async (revokesOn) =>
        this.addAllKeysToRevokesOn(
          pint(revokesOn),
          byExpiredOn[revokesOn].map((e) => e.pub)
        )
      )
    );
  }

  async addAllKeysToRevokesOn(
    revokesOn: number,
    pubkeys: Pubkey[]
  ): Promise<void> {
    const key = LevelMIndexRevokesOnIndexer.trimKey(revokesOn);
    let entry = await this.getOrNull(key);
    if (!entry) {
      entry = [];
    }
    for (const pub of pubkeys) {
      entry.push(pub);
    }
    await this.put(key, entry);
  }

  async removeAllKeysFromRevokesOn(
    revokesOn: number,
    pubkeys: Pubkey[]
  ): Promise<void> {
    // We remove the "revokes_on" indexed values
    const key = LevelMIndexRevokesOnIndexer.trimKey(revokesOn);
    const entry = await this.get(key);
    for (const pub of pubkeys) {
      if (entry.includes(pub)) {
        entry.splice(entry.indexOf(pub), 1);
      }
    }
    if (entry.length) {
      // Some revocations left
      await this.put(key, entry); // TODO: test this, can occur, probably not covered
    } else {
      // No more revocations left
      await this.del(key);
    }
  }

  async findRevokesOnLte(revokesOn: number): Promise<Pubkey[]> {
    return (
      await this.findAllValues({
        lte: LevelMIndexRevokesOnIndexer.trimKey(revokesOn),
      })
    ).reduce(reduceConcat, []);
  }

  private static trimKey(revokesOn: number) {
    return String(revokesOn).padStart(10, "0");
  }
}

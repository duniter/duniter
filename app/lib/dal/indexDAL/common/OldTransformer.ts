import { IindexEntry, Indexer } from "../../../indexer";
import { OldIindexEntry } from "../../../db/OldIindexEntry";

export const OldTransformers = {
  toOldIindexEntry(row: IindexEntry): OldIindexEntry {
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
      written_on: row.written_on,
    };
  },

  iindexEntityOrNull: async (
    reducable: IindexEntry[]
  ): Promise<OldIindexEntry | null> => {
    if (reducable.length) {
      return OldTransformers.toOldIindexEntry(
        Indexer.DUP_HELPERS.reduce(reducable)
      );
    }
    return null;
  },
};

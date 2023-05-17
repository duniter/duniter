import { FullIindexEntry, IindexEntry } from "../../../indexer";
import { ReduceableDAO } from "./ReduceableDAO";
import { OldIindexEntry } from "../../../db/OldIindexEntry";

export interface IIndexDAO extends ReduceableDAO<IindexEntry> {
  reducable(pub: string): Promise<IindexEntry[]>;

  findByPub(pub: string): Promise<IindexEntry[]>;

  findByUid(uid: string): Promise<IindexEntry[]>;

  getMembers(): Promise<{ pubkey: string; uid: string | null }[]>;

  getFromPubkey(pub: string): Promise<FullIindexEntry | null>;

  getFromUID(uid: string): Promise<FullIindexEntry | null>;

  getFromPubkeyOrUid(search: string): Promise<FullIindexEntry | null>;

  searchThoseMatching(search: string): Promise<OldIindexEntry[]>;

  getOldFromPubkey(pub: string): Promise<OldIindexEntry | null>;

  getFullFromUID(uid: string): Promise<FullIindexEntry>;

  getFullFromPubkey(pub: string): Promise<FullIindexEntry>;

  getFullFromHash(hash: string): Promise<FullIindexEntry | null>;

  getToBeKickedPubkeys(): Promise<string[]>;
}

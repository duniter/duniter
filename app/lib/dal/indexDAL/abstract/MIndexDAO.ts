import { FullMindexEntry, MindexEntry } from "../../../indexer";
import { ReduceableDAO } from "./ReduceableDAO";

export interface MIndexDAO extends ReduceableDAO<MindexEntry> {
  reducable(pub: string): Promise<MindexEntry[]>;

  getRevokedPubkeys(): Promise<string[]>;

  findByPubAndChainableOnGt(
    pub: string,
    medianTime: number
  ): Promise<MindexEntry[]>;

  findRevokesOnLteAndRevokedOnIsNull(medianTime: number): Promise<string[]>;

  findExpiresOnLteAndRevokesOnGt(medianTime: number): Promise<string[]>;

  getReducedMS(pub: string): Promise<FullMindexEntry | null>;

  findPubkeysThatShouldExpire(
    medianTime: number
  ): Promise<{ pub: string; created_on: string }[]>;

  getReducedMSForImplicitRevocation(
    pub: string
  ): Promise<FullMindexEntry | null>;
}

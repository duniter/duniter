import {FullMindexEntry, MindexEntry} from "../../../indexer"
import {ReduceableDAO} from "./ReduceableDAO"

export interface MIndexDAO extends ReduceableDAO<MindexEntry>  {

  reducable(pub:string): Promise<MindexEntry[]>

  getRevokedPubkeys(): Promise<string[]>

  findByPubAndChainableOnGt(pub:string, medianTime:number): Promise<MindexEntry[]>

  findRevokesOnLteAndRevokedOnIsNull(medianTime:number): Promise<MindexEntry[]>

  findExpiresOnLteAndRevokesOnGt(medianTime:number): Promise<MindexEntry[]>

  getReducedMS(pub:string): Promise<FullMindexEntry|null>
}

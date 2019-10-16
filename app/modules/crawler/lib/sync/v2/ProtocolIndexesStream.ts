import {CindexEntry, IindexEntry, MindexEntry, SindexEntry} from "../../../../../lib/indexer"
import {BlockDTO} from "../../../../../lib/dto/BlockDTO"

export interface ProtocolIndexesStream {
  block: BlockDTO
  mindex: MindexEntry[]
  iindex: IindexEntry[]
  sindex: SindexEntry[]
  cindex: CindexEntry[]
}

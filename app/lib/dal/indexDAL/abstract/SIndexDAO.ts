import {FullSindexEntry, SindexEntry} from "../../../indexer"
import {ReduceableDAO} from "./ReduceableDAO"

export interface SIndexDAO extends ReduceableDAO<SindexEntry> {

  findByIdentifierPosAmountBase(identifier: string, pos: number, amount: number, base: number): Promise<SindexEntry[]>

  getSource(identifier:string, pos:number): Promise<FullSindexEntry|null>

  getUDSources(pubkey:string): Promise<FullSindexEntry[]>

  getAvailableForPubkey(pubkey:string): Promise<{ amount:number, base:number }[]>

  getAvailableForConditions(conditionsStr:string): Promise<SindexEntry[]>

  trimConsumedSource(belowNumber:number): Promise<void>

  //---------------------
  //- TESTING FUNCTIONS -
  //---------------------


}

import {FullSindexEntry, SimpleTxEntryForWallet, SimpleTxInput, SindexEntry} from "../../../indexer"
import {ReduceableDAO} from "./ReduceableDAO"

export interface UDSource {
  consumed: boolean
  pos: number
  amount: number
  base: number
}

export interface SIndexDAO extends ReduceableDAO<SindexEntry> {

  findTxSourceByIdentifierPosAmountBase(identifier: string, pos: number, amount: number, base: number): Promise<SimpleTxInput[]>

  getTxSource(identifier:string, pos:number): Promise<FullSindexEntry|null>

  getAvailableForPubkey(pubkey:string): Promise<{ amount:number, base:number, conditions: string, identifier: string, pos: number }[]>

  getAvailableForConditions(conditionsStr:string): Promise<SindexEntry[]>

  trimConsumedSource(belowNumber:number): Promise<void>

  getWrittenOnTxs(blockstamp: string): Promise<SimpleTxEntryForWallet[]>

  findByIdentifier(identifier: string): Promise<SindexEntry[]>

  findByPos(pos: number): Promise<SindexEntry[]>
}

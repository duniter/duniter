import {GenericDAO} from "./GenericDAO"
import {IindexEntry, SimpleTxInput, SimpleUdEntryForWallet, SindexEntry} from "../../../indexer"

export interface DividendEntry {
  pub: string
  member: boolean
  availables: number[]
  consumed: number[]
  consumedUDs: {
    dividendNumber: number,
    txHash: string,
    txCreatedOn: string,
    txLocktime: number,
    dividend: {
      amount: number,
      base: number
    }
  }[]
  dividends: { amount: number, base: number }[]
}

export interface UDSource {
  consumed: boolean
  pos: number
  amount: number
  base: number
}

export interface DividendDAO extends GenericDAO<DividendEntry> {

  setMember(member: boolean, pub: string): Promise<void>

  produceDividend(blockNumber: number, dividend: number, unitbase: number, local_iindex: IindexEntry[]): Promise<SimpleUdEntryForWallet[]>

  getUDSources(pub: string): Promise<UDSource[]>

  findUdSourceByIdentifierPosAmountBase(identifier: string, pos: number, amount: number, base: number): Promise<SimpleTxInput[]>

  getUDSource(identifier: string, pos: number): Promise<SimpleTxInput|null>

  createMember(pub: string): Promise<void>

  consume(filter: SindexEntry[]): Promise<void>

  deleteMember(pub: string): Promise<void>

  getWrittenOnUDs(number: number): Promise<SimpleUdEntryForWallet[]>

  revertUDs(number: number): Promise<{ createdUDsDestroyedByRevert: SimpleUdEntryForWallet[], consumedUDsRecoveredByRevert: SimpleUdEntryForWallet[] }>

  findForDump(criterion: any): Promise<SindexEntry[]>

  trimConsumedUDs(belowNumber:number): Promise<void>
}

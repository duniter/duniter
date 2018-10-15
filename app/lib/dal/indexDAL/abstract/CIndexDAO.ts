import {CindexEntry, FullCindexEntry} from "../../../indexer"
import {ReduceableDAO} from "./ReduceableDAO"

export interface CIndexDAO extends ReduceableDAO<CindexEntry> {

  getValidLinksTo(receiver:string): Promise<CindexEntry[]>

  getValidLinksFrom(issuer:string): Promise<CindexEntry[]>

  findExpired(medianTime:number): Promise<CindexEntry[]>

  findByIssuerAndReceiver(issuer: string, receiver: string): Promise<CindexEntry[]>

  findByIssuerAndChainableOnGt(issuer: string, medianTime: number): Promise<CindexEntry[]>

  findByReceiverAndExpiredOn(pub: string, expired_on: number): Promise<CindexEntry[]>

  existsNonReplayableLink(issuer:string, receiver:string): Promise<boolean>

  getReceiversAbove(minsig: number): Promise<string[]>

  reducablesFrom(from:string): Promise<FullCindexEntry[]>

  trimExpiredCerts(belowNumber:number): Promise<void>

  findByIssuer(issuer: string): Promise<CindexEntry[]>
}

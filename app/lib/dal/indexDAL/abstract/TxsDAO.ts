import {GenericDAO} from "./GenericDAO"
import {TransactionDTO} from "../../../dto/TransactionDTO"
import {SandBox} from "../../sqliteDAL/SandBox"
import {DBTx} from "../../../db/DBTx"

export interface TxsDAO extends GenericDAO<DBTx> {

  trimExpiredNonWrittenTxs(limitTime:number): Promise<void>

  getAllPending(versionMin:number): Promise<DBTx[]>

  getTX(hash:string): Promise<DBTx>

  addLinked(tx:TransactionDTO, block_number:number, time:number): Promise<DBTx>

  addPending(dbTx:DBTx): Promise<DBTx>

  getLinkedWithIssuer(pubkey:string): Promise<DBTx[]>

  getLinkedWithRecipient(pubkey:string): Promise<DBTx[]>

  getPendingWithIssuer(pubkey:string): Promise<DBTx[]>

  getPendingWithRecipient(pubkey:string): Promise<DBTx[]>

  removeTX(hash:string): Promise<void>

  removeAll(): Promise<void>

  sandbox:SandBox<{ issuers: string[], output_base:number, output_amount:number }>

  getSandboxRoom(): Promise<number>

  setSandboxSize(size:number): void
}

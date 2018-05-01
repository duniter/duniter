import {GenericDAO} from "./GenericDAO"
import {DBBlock} from "../../../db/DBBlock"

export interface BlockchainDAO extends GenericDAO<DBBlock> {

  getCurrent(): Promise<DBBlock|null>

  getBlock(number:string | number): Promise<DBBlock|null>

  getAbsoluteBlock(number:number, hash:string): Promise<DBBlock|null>

  saveBlock(block:DBBlock): Promise<DBBlock>

  saveSideBlock(block:DBBlock): Promise<DBBlock>

  getPotentialRoots(): Promise<DBBlock[]>

  getBlocks(start:number, end:number): Promise<DBBlock[]>

  getNextForkBlocks(number:number, hash:string): Promise<DBBlock[]>

  getPotentialForkBlocks(numberStart:number, medianTimeStart:number, maxNumber:number): Promise<DBBlock[]>

  lastBlockOfIssuer(issuer:string): Promise<DBBlock|null>

  getCountOfBlocksIssuedBy(issuer:string): Promise<number>

  saveBunch(blocks:DBBlock[]): Promise<void>

  dropNonForkBlocksAbove(number: number): Promise<void>

  setSideBlock(number:number, previousBlock:DBBlock|null): Promise<void>
}

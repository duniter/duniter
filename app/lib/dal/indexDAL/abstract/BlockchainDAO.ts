import {GenericDAO} from "./GenericDAO"
import {DBBlock} from "../../../db/DBBlock"
import {ForksDAO} from "./software/ForksDAO"

export interface BlockchainDAO extends GenericDAO<DBBlock>, ForksDAO {

  getCurrent(): Promise<DBBlock|null>

  getBlock(number:string | number): Promise<DBBlock|null>

  getAbsoluteBlock(number:number, hash:string): Promise<DBBlock|null>

  saveBlock(block:DBBlock): Promise<DBBlock>

  getBlocks(start:number, end:number): Promise<DBBlock[]>

  lastBlockOfIssuer(issuer:string): Promise<DBBlock|null>

  lastBlockWithDividend(): Promise<DBBlock|null>

  getCountOfBlocksIssuedBy(issuer:string): Promise<number>

  saveBunch(blocks:DBBlock[]): Promise<void>

  dropNonForkBlocksAbove(number: number): Promise<void>
}

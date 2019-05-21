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

  dropNonForkBlocksAbove(number: number): Promise<void>

  findWithIdentities(): Promise<number[]>
  findWithCertifications(): Promise<number[]>
  findWithJoiners(): Promise<number[]>
  findWithActives(): Promise<number[]>
  findWithLeavers(): Promise<number[]>
  findWithExcluded(): Promise<number[]>
  findWithRevoked(): Promise<number[]>
  findWithUD(): Promise<number[]>
  findWithTXs(): Promise<number[]>
}

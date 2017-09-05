import {BlockDTO} from "../../dto/BlockDTO"

export interface WS2PReqMapper {

  getCurrent(): Promise<BlockDTO>
  getBlock(number:number): Promise<BlockDTO[]>
  getBlocks(count:number, fromNumber:number): Promise<BlockDTO[]>
}
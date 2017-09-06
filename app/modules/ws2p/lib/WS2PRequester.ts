import {WS2PConnection} from "./WS2PConnection"
import {BlockDTO} from "../../../lib/dto/BlockDTO"

export enum WS2P_REQ {
  WOT_REQUIREMENTS_OF_PENDING,
  BLOCKS_CHUNK,
  BLOCK_BY_NUMBER,
  CURRENT
}

export class WS2PRequester {

  private constructor(
    protected ws2pc:WS2PConnection) {}

  static fromConnection(ws2pc:WS2PConnection) {
    return new WS2PRequester(ws2pc)
  }

  getCurrent(): Promise<BlockDTO> {
    return this.query(WS2P_REQ.CURRENT)
  }

  getBlock(number:number): Promise<BlockDTO> {
    return this.query(WS2P_REQ.BLOCK_BY_NUMBER, { number })
  }

  getBlocks(count:number, fromNumber:number): Promise<BlockDTO[]> {
    return this.query(WS2P_REQ.BLOCKS_CHUNK, { count, fromNumber })
  }

  async getRequirementsPending(minCert = 1): Promise<any> {
    return this.query(WS2P_REQ.WOT_REQUIREMENTS_OF_PENDING, { minCert })
  }

  private query(req:WS2P_REQ, params:any = {}): Promise<any> {
    return this.ws2pc.request({
      name: WS2P_REQ[req],
      params: params
    })
  }
}
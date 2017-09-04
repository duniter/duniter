import {BlockDTO} from "../../dto/BlockDTO"

export interface WS2PReqMapper {

  getCurrent(): Promise<BlockDTO>
}
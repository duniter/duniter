import {WS2PMessageHandler} from "../impl/WS2PMessageHandler"
import {WS2PResponse} from "../impl/WS2PResponse"
import {Server} from "../../../../server"
import {WS2PReqMapperByServer} from "../impl/WS2PReqMapperByServer"
import {WS2PReqMapper} from "./WS2PReqMapper"
import {BlockDTO} from "../../dto/BlockDTO"
import {IdentityDTO} from "../../dto/IdentityDTO"
import {CertificationDTO} from "../../dto/CertificationDTO"
import {MembershipDTO} from "../../dto/MembershipDTO"
import {TransactionDTO} from "../../dto/TransactionDTO"
import {PeerDTO} from "../../dto/PeerDTO"

enum WS2P_REQ {
  CURRENT
}

export enum WS2P_REQERROR {
  UNKNOWN_REQUEST
}

export class WS2PServerMessageHandler implements WS2PMessageHandler {

  protected mapper:WS2PReqMapper

  constructor(protected server:Server) {
    this.mapper = new WS2PReqMapperByServer(server)
  }

  async handlePushMessage(json: any): Promise<void> {
    try {
      if (json.body) {
        if (json.body.block) {
          const dto = BlockDTO.fromJSONObject(json.body.block)
          const raw = dto.getRawSigned()
          await this.server.writeRawBlock(raw)
        }
        else if (json.body.identity) {
          const dto = IdentityDTO.fromJSONObject(json.body.identity)
          const raw = dto.getRawSigned()
          await this.server.writeRawIdentity(raw)
        }
        else if (json.body.certification) {
          const dto = CertificationDTO.fromJSONObject(json.body.certification)
          const raw = dto.getRawSigned()
          await this.server.writeRawCertification(raw)
        }
        else if (json.body.membership) {
          const dto = MembershipDTO.fromJSONObject(json.body.membership)
          const raw = dto.getRawSigned()
          await this.server.writeRawMembership(raw)
        }
        else if (json.body.transaction) {
          const dto = TransactionDTO.fromJSONObject(json.body.transaction)
          const raw = dto.getRaw()
          await this.server.writeRawTransaction(raw)
        }
        else if (json.body.peer) {
          const dto = PeerDTO.fromJSONObject(json.body.peer)
          const raw = dto.getRawSigned()
          await this.server.writeRawPeer(raw)
        }
      }
    } catch(e) {
      this.server.logger.warn(e)
    }
  }

  async answerToRequest(data: any): Promise<WS2PResponse> {

    /**********
     * REQUEST
     *********/

    let body:any = {}

    if (data && data.name) {
      switch (data.name) {
        case WS2P_REQ[WS2P_REQ.CURRENT]:
          body = await this.mapper.getCurrent()
          break;
        default:
          throw Error(WS2P_REQERROR[WS2P_REQERROR.UNKNOWN_REQUEST])
      }
    }

    return body
  }
}
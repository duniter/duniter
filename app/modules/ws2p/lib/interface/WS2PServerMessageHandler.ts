import {WS2PMessageHandler} from "../impl/WS2PMessageHandler"
import {WS2PResponse} from "../impl/WS2PResponse"
import {Server} from "../../../../../server"
import {WS2PReqMapperByServer} from "../impl/WS2PReqMapperByServer"
import {WS2PReqMapper} from "./WS2PReqMapper"
import {BlockDTO} from "../../../../lib/dto/BlockDTO"
import {IdentityDTO} from "../../../../lib/dto/IdentityDTO"
import {CertificationDTO} from "../../../../lib/dto/CertificationDTO"
import {MembershipDTO} from "../../../../lib/dto/MembershipDTO"
import {TransactionDTO} from "../../../../lib/dto/TransactionDTO"
import {PeerDTO} from "../../../../lib/dto/PeerDTO"
import {WS2P_REQ} from "../WS2PRequester"
import {WS2PCluster} from "../WS2PCluster"
import {WS2PConnection} from "../WS2PConnection"
import {WS2PConstants} from "../constants"

export enum WS2P_REQERROR {
  UNKNOWN_REQUEST
}

export class WS2PServerMessageHandler implements WS2PMessageHandler {

  protected mapper:WS2PReqMapper
  private errors:{
    [k:string]: {
      createdOn: number,
      pubkeys: {
        [p:string]: boolean
      }
    }
  } = {}

  constructor(protected server:Server, protected cluster:WS2PCluster) {
    this.mapper = new WS2PReqMapperByServer(server)
  }

  async handlePushMessage(json: any, c:WS2PConnection): Promise<void> {
    let documentHash = ''
    try {
      if (json.body) {
        if (json.body.block) {
          const dto = BlockDTO.fromJSONObject(json.body.block)
          const raw = dto.getRawSigned()
          documentHash = dto.getHash()
          await this.server.writeRawBlock(raw)
        }
        else if (json.body.identity) {
          const dto = IdentityDTO.fromJSONObject(json.body.identity)
          const raw = dto.getRawSigned()
          documentHash = dto.getHash()
          await this.server.writeRawIdentity(raw)
        }
        else if (json.body.certification) {
          const dto = CertificationDTO.fromJSONObject(json.body.certification)
          const raw = dto.getRawSigned()
          documentHash = dto.getHash()
          await this.server.writeRawCertification(raw)
        }
        else if (json.body.membership) {
          const dto = MembershipDTO.fromJSONObject(json.body.membership)
          const raw = dto.getRawSigned()
          documentHash = dto.getHash()
          await this.server.writeRawMembership(raw)
        }
        else if (json.body.transaction) {
          const dto = TransactionDTO.fromJSONObject(json.body.transaction)
          const raw = dto.getRaw()
          documentHash = dto.getHash()
          await this.server.writeRawTransaction(raw)
        }
        else if (json.body.peer) {
          const dto = PeerDTO.fromJSONObject(json.body.peer)
          const raw = dto.getRawSigned()
          documentHash = dto.getHash()
          await this.server.writeRawPeer(raw)
        }
        else if (json.body.heads && typeof json.body.heads === "object" && json.body.heads.length !== undefined) {
          if (!json.body.heads.length) {
            documentHash = 'HEADs'
            throw "Heads empty HEADs received"
          }
          await this.cluster.headsReceived(json.body.heads || [])
        }
      }
    } catch(e) {
      if (documentHash
        && this.errors[documentHash]
        && this.errors[documentHash].pubkeys[c.pubkey] !== undefined
        && this.server.conf.pair.pub !== c.pubkey) { // We do not want to ban ourselves
        this.cluster.banConnection(c, "Peer " + (c.pubkey || '--unknown--') + " sending again a wrong document")
      } else {
        // Remember the error for some time
        if (!this.errors[documentHash]) {
          this.errors[documentHash] = {
            createdOn: Date.now(),
            pubkeys: {}
          }
        }
        this.errors[documentHash].pubkeys[c.pubkey] = true
        setTimeout(() => {
          delete this.errors[documentHash]
        }, 1000 * WS2PConstants.ERROR_RECALL_DURATION_IN_SECONDS)
      }
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
        case WS2P_REQ[WS2P_REQ.BLOCK_BY_NUMBER]:
          if (isNaN(data.params.number)) {
            throw "Wrong param `number`"
          }
          const number:number = data.params.number
          body = await this.mapper.getBlock(number)
          break;
        case WS2P_REQ[WS2P_REQ.BLOCKS_CHUNK]:
          if (isNaN(data.params.count)) {
            throw "Wrong param `count`"
          }
          if (isNaN(data.params.fromNumber)) {
            throw "Wrong param `fromNumber`"
          }
          const count:number = data.params.count
          const fromNumber:number = data.params.fromNumber
          body = await this.mapper.getBlocks(count, fromNumber)
          break;
        case WS2P_REQ[WS2P_REQ.WOT_REQUIREMENTS_OF_PENDING]:
          if (isNaN(data.params.minCert)) {
            throw "Wrong param `minCert`"
          }
          const minCert:number = data.params.minCert
          body = await this.mapper.getRequirementsOfPending(minCert)
          break;
        default:
          throw Error(WS2P_REQERROR[WS2P_REQERROR.UNKNOWN_REQUEST])
      }
    }

    return body
  }
}
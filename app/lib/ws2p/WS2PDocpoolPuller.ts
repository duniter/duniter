import {Server} from "../../../server"
import {WS2PConnection} from "./WS2PConnection"
import {WS2PRequester} from "./WS2PRequester"
import {pullSandboxToLocalServer} from "../../modules/crawler/lib/sandbox"

export class WS2PDocpoolPuller {

  constructor(
    private server:Server,
    private connection:WS2PConnection
  ) {}

  async pull() {
    const requester = WS2PRequester.fromConnection(this.connection)
    // node.pubkey = p.pubkey;
    return pullSandboxToLocalServer(this.server.conf.currency, {
      getRequirementsPending: (minCert = 1) => {
        return requester.getRequirementsPending(minCert)
      }
    }, this.server, this.server.logger)
  }
}

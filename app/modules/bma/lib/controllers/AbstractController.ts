import {Server} from "../../../../../server"
import {dos2unix} from "../../../../lib/common-libs/dos2unix"

export abstract class AbstractController {

  constructor(protected server:Server) {
  }

  get conf() {
    return this.server.conf
  }

  get logger() {
    return this.server.logger
  }

  get BlockchainService() {
    return this.server.BlockchainService
  }

  get IdentityService() {
    return this.server.IdentityService
  }

  get PeeringService() {
    return this.server.PeeringService
  }

  get MerkleService() {
    return this.server.MerkleService
  }

  async pushEntity(req:any, rawer:(req:any)=>string, type:any) {
    let rawDocument = rawer(req);
    rawDocument = dos2unix(rawDocument);
    const written = await this.server.writeRaw(rawDocument, type);
    try {
      return written.json();
    } catch (e) {
      this.logger.error('Written:', written);
      this.logger.error(e);
      throw e;
    }
  }
}
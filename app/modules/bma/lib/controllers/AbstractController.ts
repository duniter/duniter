import {Server} from "../../../../../server";
import {dos2unix} from "../../../../lib/common-libs/dos2unix";
import {CommonConstants} from "../../../../lib/common-libs/constants";

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

  async pushEntity<T>(req:any, rawer:(req:any)=>string, task:(raw:string) => Promise<T>): Promise<T> {
    let rawDocument = rawer(req);
    rawDocument = dos2unix(rawDocument);
    try {
      return await task(rawDocument)
    } catch (e) {
      const event = CommonConstants.DocumentError
      this.server.emit(event, e)
      this.logger.error(e);
      throw e;
    }
  }
}
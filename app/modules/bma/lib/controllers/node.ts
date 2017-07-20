"use strict";
import {AbstractController} from "./AbstractController"

export class NodeBinding extends AbstractController {

  summary = () => {
    return {
      "duniter": {
        "software": "duniter",
        "version": this.server.version,
        "forkWindowSize": this.server.conf.forksize
      }
    }
  }

  async sandboxes() {
    return {
      identities: await sandboxIt(this.server.dal.idtyDAL.sandbox),
      memberships: await sandboxIt(this.server.dal.msDAL.sandbox),
      transactions: await sandboxIt(this.server.dal.txsDAL.sandbox)
    }
  }
}

async function sandboxIt(sandbox:any) {
  return {
    size: sandbox.maxSize,
    free: await sandbox.getSandboxRoom()
  }
}

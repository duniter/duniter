"use strict";
import {AbstractController} from "./AbstractController"
import {HttpSandbox, HttpSandboxes, HttpSummary} from "../dtos";

export class NodeBinding extends AbstractController {

  summary = (): HttpSummary => {
    return {
      "duniter": {
        "software": "duniter",
        "version": this.server.version,
        "forkWindowSize": this.server.conf.forksize
      }
    }
  }

  async sandboxes(): Promise<HttpSandboxes> {
    return {
      identities: await sandboxIt(this.server.dal.idtyDAL.sandbox),
      memberships: await sandboxIt(this.server.dal.msDAL.sandbox),
      transactions: await sandboxIt(this.server.dal.txsDAL.sandbox)
    }
  }
}

async function sandboxIt(sandbox:any): Promise<HttpSandbox> {
  return {
    size: sandbox.maxSize,
    free: await sandbox.getSandboxRoom()
  }
}

"use strict";
import {PermanentProver} from "./permanentProver"
import * as stream from "stream"
import {OtherConstants} from "../../../lib/other_constants"

export class Prover extends stream.Transform {

  permaProver:PermanentProver

  constructor(server:any) {
    super({ objectMode: true })
    this.permaProver = new PermanentProver(server)
  }

  _write(obj:any, enc:any, done:any) {
    // Never close the stream
    if (obj) {
      if (obj.bcEvent && obj.bcEvent === OtherConstants.BC_EVENT.HEAD_CHANGED || obj.bcEvent === OtherConstants.BC_EVENT.SWITCHED) {
        this.permaProver.blockchainChanged(obj.block);
      } /*else if (obj.nodeIndexInPeers !== undefined) {
        this.permaProver.prover.changePoWPrefix((obj.nodeIndexInPeers + 1) * 10); // We multiply by 10 to give room to computers with < 100 cores
      }*/ else if (obj.cpu !== undefined) {
        this.permaProver.prover.changeCPU(obj.cpu); // We multiply by 10 to give room to computers with < 100 cores
      }
    }
    done && done();
  };

  async startService() {
    this.permaProver.allowedToStart();
  }

  async stopService() {
    await this.permaProver.stopEveryting();
  }
}

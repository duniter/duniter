"use strict";
import {PermanentProver} from "./permanentProver"
import * as stream from "stream"

export class Prover extends stream.Transform {

  permaProver:PermanentProver

  constructor(server:any) {
    super({ objectMode: true })
    this.permaProver = new PermanentProver(server)
  }

  _write(obj:any, enc:any, done:any) {
    // Never close the stream
    if (obj && obj.membersCount) {
      this.permaProver.blockchainChanged(obj);
    } else if (obj.nodeIndexInPeers !== undefined) {
      this.permaProver.prover.changePoWPrefix((obj.nodeIndexInPeers + 1) * 10); // We multiply by 10 to give room to computers with < 100 cores
    } else if (obj.cpu !== undefined) {
      this.permaProver.prover.changeCPU(obj.cpu); // We multiply by 10 to give room to computers with < 100 cores
    } else if (obj.pulling !== undefined) {
      if (obj.pulling === 'processing') {
        this.permaProver.pullingDetected();
      }
      else if (obj.pulling === 'finished') {
        this.permaProver.pullingFinished();
      }
    }
    done && done();
  };

  async startService() {
    this.permaProver.allowedToStart();
  }

  async stopService() {
    this.permaProver.stopEveryting();
  }
}

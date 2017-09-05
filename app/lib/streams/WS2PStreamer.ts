import * as stream from "stream"
import {WS2PConnection} from "../ws2p/WS2PConnection"

export class WS2PStreamer extends stream.Transform {

  constructor(private ws2pc:WS2PConnection) {
    super({ objectMode: true })
  }

  async _write(obj:any, enc:any, done:any) {
    if (obj.joiners) {
      await this.ws2pc.pushBlock(obj)
    }
    else if (obj.pubkey && obj.uid) {
      await this.ws2pc.pushIdentity(obj)
    }
    else if (obj.idty_uid) {
      await this.ws2pc.pushCertification(obj)
    }
    else if (obj.userid) {
      await this.ws2pc.pushMembership(obj)
    }
    else if (obj.issuers) {
      await this.ws2pc.pushTransaction(obj)
    }
    else if (obj.endpoints) {
      await this.ws2pc.pushPeer(obj)
    }
    done && done();
  }
}

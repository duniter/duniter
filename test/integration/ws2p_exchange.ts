import {WS2PConnection} from "../../app/modules/ws2p/lib/WS2PConnection"
import {Key} from "../../app/lib/common-libs/crypto/keyring"
import {newWS2PBidirectionnalConnection} from "./tools/toolbox"
import {WS2PRequester} from "../../app/modules/ws2p/lib/WS2PRequester"
import {BlockDTO} from "../../app/lib/dto/BlockDTO"
import {WS2PMessageHandler} from "../../app/modules/ws2p/lib/impl/WS2PMessageHandler"
import {WS2PResponse} from "../../app/modules/ws2p/lib/impl/WS2PResponse"
const assert = require('assert');

describe('WS2P exchange', () => {

  let wss:any
  let c1:WS2PConnection, s1:WS2PConnection

  before(async () => {
    const serverPair = new Key('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F')
    const clientPair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP')
    const res = await newWS2PBidirectionnalConnection("gtest", serverPair, clientPair, new (class TestingHandler implements WS2PMessageHandler {

      async handlePushMessage(json: any): Promise<void> {
      }

      async answerToRequest(json: any): Promise<WS2PResponse> {
        return BlockDTO.fromJSONObject({ number: 1, hash: 'A' })
      }
    }))
    s1 = res.p1
    c1 = res.p2
    wss = res.wss
  })

  after((done) => {
    wss.close(done)
  })

  it('should accept the connection if everything is OK on both side', async () => {
    const requester1 = WS2PRequester.fromConnection(c1)
    assert.deepEqual(await requester1.getCurrent(), {
      "actives": [],
      "certifications": [],
      "currency": "",
      "dividend": null,
      "excluded": [],
      "fork": false,
      "hash": "A",
      "identities": [],
      "issuer": "",
      "issuersCount": null,
      "issuersFrame": null,
      "issuersFrameVar": null,
      "joiners": [],
      "leavers": [],
      "medianTime": null,
      "membersCount": null,
      "monetaryMass": 0,
      "nonce": null,
      "number": 1,
      "parameters": "",
      "powMin": null,
      "revoked": [],
      "signature": "",
      "time": null,
      "transactions": [],
      "unitbase": null,
      "version": 10
    })
  })
})

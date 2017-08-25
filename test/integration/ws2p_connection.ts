import {WS2PConnection, WS2PNoAuth, WS2PPubkeyAuth} from "../../app/lib/ws2p/WS2PConnection"
import {Key, verify} from "../../app/lib/common-libs/crypto/keyring"
import {assertThrows} from "./tools/toolbox"
const assert = require('assert');
const WebSocketServer = require('ws').Server

describe("WS2P client connection", function() {

  describe("no auth", () => {

    let wss:any

    before(async () => {
      wss = new WebSocketServer({ port: 20902 })
      wss.on('connection', (ws:any) => {
        ws.on('message', (data:any) => {
          const obj = JSON.parse(data)
          if (obj.uuid) {
            ws.send(JSON.stringify({ uuid: obj.uuid, body: { bla: 'aa' } }))
          }
        })
      })
    })

    after((done) => {
      wss.close(done)
    })

    it('should be able to create a connection', async () => {
      const ws2p = new WS2PConnection(() => {}, new WS2PNoAuth())
      await ws2p.connect('localhost:20902')
      const res = await ws2p.request({ message: 'head' })
      assert.deepEqual({ bla: 'aa' }, res)
    })
  })

  describe("pubkey auth", () => {

    let wss:any, clientAskError = ""

    before(async () => {
      const serverKeypair = new Key('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F')
      let nbAsk = 0
      wss = new WebSocketServer({ port: 20903 })
      wss.on('connection', (ws:any) => {
        ws.on('message', (data:any) => {
          const obj = JSON.parse(data)
          if (obj.uuid) {
            ws.send(JSON.stringify({ uuid: obj.uuid, body: { bla: 'aa' } }))
          }
          if (obj.auth) {
            if (nbAsk == 1 || nbAsk == 3) {
              const challengeMessage = `WS2P:ACK:${serverKeypair.pub}:${obj.challenge}`
              const sig = serverKeypair.signSync(challengeMessage)
              if (nbAsk == 1) {
                ws.send(JSON.stringify({ auth: 'ACK', pub: serverKeypair.pub, sig: 'hiohoihio' }))
              }
              if (nbAsk == 3) {
                ws.send(JSON.stringify({ auth: 'ACK', pub: serverKeypair.pub, sig }))
              }
            }
            if (nbAsk == 2) {
              // We do like if the key was wrong
              const clientPub = 'GgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'
              const challengeMessage = `WS2P:ASK:${clientPub}:${obj.challenge}`
              if (!verify(challengeMessage, obj.sig, clientPub)) {
                clientAskError = 'Wrong signature from client ASK'
              }
            }
            nbAsk++
          }
        })
      })
    })

    after((done) => {
      wss.close(done)
    })

    it('should refuse the connection if the server does not answer', async () => {
      const keypair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP')
      const ws2p = new WS2PConnection(() => {}, new WS2PPubkeyAuth(keypair), {
        connectionTimeout: 100,
        requestTimeout: 100
      })
      await assertThrows(ws2p.connect('localhost:20903'), "WS2P connection timeout")
    })

    it('should refuse the connection if the server answers with a wrong signature', async () => {
      const keypair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP')
      const ws2p = new WS2PConnection(() => {}, new WS2PPubkeyAuth(keypair), {
        connectionTimeout: 100,
        requestTimeout: 100
      })
      await assertThrows(ws2p.connect('localhost:20903'), "Wrong signature from server ACK")
    })

    it('should refuse the connection if the server refuses our signature', async () => {
      const keypair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP')
      const ws2p = new WS2PConnection(() => {}, new WS2PPubkeyAuth(keypair), {
        connectionTimeout: 100,
        requestTimeout: 100
      })
      await assertThrows(ws2p.connect('localhost:20903'), "WS2P connection timeout")
      assert.equal('Wrong signature from client ASK', clientAskError)
    })

    it('should accept the connection if the server answers with a wrong signature', async () => {
      const keypair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP')
      const ws2p = new WS2PConnection(() => {}, new WS2PPubkeyAuth(keypair), {
        connectionTimeout: 1000,
        requestTimeout: 1000
      })
      await ws2p.connect('localhost:20903')
      const res = await ws2p.request({ message: 'head' })
      assert.deepEqual({ bla: 'aa' }, res)
    })
  })
})
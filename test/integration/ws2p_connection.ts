import {
  WS2PConnection,
  WS2PLocalAuth,
  WS2PPubkeyLocalAuth,
  WS2PPubkeyRemoteAuth,
  WS2PRemoteAuth
} from "../../app/modules/ws2p/lib/WS2PConnection"
import {Key, verify} from "../../app/lib/common-libs/crypto/keyring"
import {assertThrows, getNewTestingPort} from "./tools/toolbox"
import {WS2PMessageHandler} from "../../app/modules/ws2p/lib/impl/WS2PMessageHandler"
import {WS2PResponse} from "../../app/modules/ws2p/lib/impl/WS2PResponse"
import {WS2PConstants} from "../../app/modules/ws2p/lib/constants"
const assert = require('assert');
const WebSocketServer = require('ws').Server
const logger = require('../../app/lib/logger').NewLogger('ws2p')
const gtest = "gtest"

describe('WS2P', () => {

  WS2PConstants.CONNEXION_TIMEOUT = 100
  WS2PConstants.REQUEST_TIMEOUT= 100

  describe("WS2P client connection", function() {

    describe("no auth", () => {

      let wss:any, portA:number

      before(async () => {
        portA = getNewTestingPort()
        wss = new WebSocketServer({ port: portA })
        wss.on('connection', (ws:any) => {
          ws.on('message', (data:any) => {
            const obj = JSON.parse(data)
            if (obj.reqId) {
              ws.send(JSON.stringify({ resId: obj.reqId, body: { bla: 'aa' } }))
            }
          })
        })
      })

      after((done) => {
        wss.close(done)
      })

      it('should be able to create a connection', async () => {
        const ws2p = WS2PConnection.newConnectionToAddress(1, 'ws://localhost:' + portA, new WS2PMutedHandler(), new WS2PNoLocalAuth(), new WS2PNoRemoteAuth())
        const res = await ws2p.request({ name: 'head' })
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
            if (obj.reqId) {
              ws.send(JSON.stringify({ resId: obj.reqId, body: { bla: 'aa' } }))
            }
            if (obj.auth) {
              if (nbAsk == 1 || nbAsk == 3) {
                const challengeMessage = `WS2P:ACK:gtest:${serverKeypair.pub}:${obj.challenge}`
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
                const challengeMessage = `WS2P:CONNECT:${clientPub}:${obj.challenge}`
                if (!verify(challengeMessage, obj.sig, clientPub)) {
                  clientAskError = 'Wrong signature from client CONNECT'
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
        const ws2p = WS2PConnection.newConnectionToAddress(1, 'ws://localhost:20903', new WS2PMutedHandler(), new WS2PPubkeyLocalAuth(gtest, keypair, ""), new WS2PPubkeyRemoteAuth(gtest, keypair), undefined, {
          connectionTimeout: 100,
          requestTimeout: 100
        })
        await assertThrows(ws2p.request({ name: 'a' }), "WS2P connection timeout")
      })

      it('should refuse the connection if the server answers with a wrong signature', async () => {
        const keypair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP')
        const ws2p = WS2PConnection.newConnectionToAddress(1, 'ws://localhost:20903', new WS2PMutedHandler(), new WS2PPubkeyLocalAuth(gtest, keypair, ""), new WS2PPubkeyRemoteAuth(gtest, keypair), undefined, {
          connectionTimeout: 100,
          requestTimeout: 100
        })
        await assertThrows(ws2p.request({ name: 'a' }), "Wrong signature from server ACK")
      })

      it('should refuse the connection if the server refuses our signature', async () => {
        const keypair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP')
        const ws2p = WS2PConnection.newConnectionToAddress(1, 'ws://localhost:20903', new WS2PMutedHandler(), new WS2PPubkeyLocalAuth(gtest, keypair, ""), new WS2PPubkeyRemoteAuth(gtest, keypair), undefined, {
          connectionTimeout: 100,
          requestTimeout: 100
        })
        await assertThrows(ws2p.request({ name: 'a' }), "WS2P connection timeout")
        assert.equal('Wrong signature from client CONNECT', clientAskError)
      })

      it('should accept the connection if the server answers with a good signature', async () => {
        const keypair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP')
        const ws2p = WS2PConnection.newConnectionToAddress(1, 'ws://localhost:20903', new WS2PMutedHandler(), new WS2PPubkeyLocalAuth(gtest, keypair, ""), new WS2PNoRemoteAuth(), undefined, {
          connectionTimeout: 1000,
          requestTimeout: 1000
        })
        const res = await ws2p.request({ name: 'head' })
        assert.deepEqual({ bla: 'aa' }, res)
      })
    })
  })

  describe("WS2P server connection", function() {

    describe("no auth", () => {

      let wss:any
      let s1:WS2PConnection
      let s2:WS2PConnection
      let portB:number

      before(async () => {
        let i = 0
        portB = getNewTestingPort()
        wss = new WebSocketServer({ port: portB })
        wss.on('connection', (ws:any) => {
          switch (i) {
            case 0:
              s1 = WS2PConnection.newConnectionFromWebSocketServer(ws, new (class TmpHandler implements WS2PMessageHandler {
                async handlePushMessage(json: any): Promise<void> {
                }
                async answerToRequest(json: any): Promise<WS2PResponse> {
                  return { answer: 'world' }
                }
              }), new WS2PNoLocalAuth(), new WS2PNoRemoteAuth())
              s1.connect().catch(e => logger.error('WS2P: newConnectionFromWebSocketServer connection error'))
              break
            case 1:
              let j = 0
              s2 = WS2PConnection.newConnectionFromWebSocketServer(ws, new (class TmpHandler implements WS2PMessageHandler {
                async handlePushMessage(json: any): Promise<void> {
                }
                async answerToRequest(json: any): Promise<WS2PResponse> {
                  return { answer: 'this is s2![j = ' + (j++) + ']' }
                }
              }), new WS2PNoLocalAuth(), new WS2PNoRemoteAuth())
              s2.connect().catch(e => logger.error('WS2P: newConnectionFromWebSocketServer connection error'))
              break
          }
          i++
        })
      })

      after((done) => {
        wss.close(done)
      })

      it('should be able to create connections and make several requests', async () => {
        // connection 1
        const c1 = WS2PConnection.newConnectionToAddress(1, 'ws://localhost:' + portB, new WS2PMutedHandler(), new WS2PNoLocalAuth(), new WS2PNoRemoteAuth())
        assert.deepEqual({ answer: 'world' }, await c1.request({ name: 'hello!' }))
        assert.deepEqual({ answer: 'world' }, await c1.request({ name: 'hello2!' }))
        assert.equal(s1.nbRequests, 0)
        assert.equal(c1.nbRequests, 2)
        assert.equal(s1.nbResponses, 0)
        assert.equal(c1.nbResponses, 2)
        assert.equal(s1.nbPushsToRemote, 0)
        assert.equal(c1.nbPushsToRemote, 0)
        assert.equal(s1.nbPushsByRemote, 0)
        assert.equal(c1.nbPushsByRemote, 0)
        // connection 2
        const c2 = WS2PConnection.newConnectionToAddress(1 ,'ws://localhost:' + portB, new WS2PMutedHandler(), new WS2PNoLocalAuth(), new WS2PNoRemoteAuth())
        assert.deepEqual({ answer: 'this is s2![j = 0]' }, await c2.request({ name: 'test?' }))
        assert.deepEqual({ answer: 'this is s2![j = 1]' }, await c2.request({ name: 'test!' }))
        assert.deepEqual({ answer: 'this is s2![j = 2]' }, await c2.request({ name: 'test!!!' }))
        assert.equal(s1.nbRequests, 0)
        assert.equal(c2.nbRequests, 3)
        assert.equal(s1.nbResponses, 0)
        assert.equal(c2.nbResponses, 3)
        assert.equal(s1.nbPushsToRemote, 0)
        assert.equal(c2.nbPushsToRemote, 0)
        assert.equal(s1.nbPushsByRemote, 0)
        assert.equal(c2.nbPushsByRemote, 0)
      })
    })

    describe("pubkey auth", () => {

      let wss:any
      let resolveS1:any
      let resolveS2:any
      let resolveS3:any
      let resolveS4:any
      let resolveS5:any
      let resolveS6:any
      let s1p:Promise<WS2PConnection> = new Promise(res => resolveS1 = res)
      let s2p:Promise<WS2PConnection> = new Promise(res => resolveS2 = res)
      let s3p:Promise<WS2PConnection> = new Promise(res => resolveS3 = res)
      let s4p:Promise<WS2PConnection> = new Promise(res => resolveS4 = res)
      let s5p:Promise<WS2PConnection> = new Promise(res => resolveS5 = res)
      let s6p:Promise<WS2PConnection> = new Promise(res => resolveS6 = res)

      before(async () => {
        let i = 1
        wss = new WebSocketServer({ port: 20903 })
        const serverKeypair = new Key('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F')
        wss.on('connection', async (ws:any) => {
          switch (i) {
            case 1:
              resolveS1(WS2PConnection.newConnectionFromWebSocketServer(ws, new WS2PMutedHandler(), new WS2PPubkeyLocalAuth(gtest, serverKeypair, ""), new WS2PPubkeyRemoteAuth(gtest, serverKeypair), {
                connectionTimeout: 100,
                requestTimeout: 100
              }));
              (await s1p).connect().catch((e:any) => logger.error('WS2P: newConnectionFromWebSocketServer connection error'))
              break
            case 2:

            class WS2PPubkeyNotAnsweringWithOKAuth extends WS2PPubkeyRemoteAuth {
              async registerOK(sig: string): Promise<boolean> {
                return Promise.resolve(true)
              }
            }

              resolveS2(WS2PConnection.newConnectionFromWebSocketServer(ws, new WS2PMutedHandler(), new WS2PPubkeyLocalAuth(gtest, serverKeypair, ""), new WS2PPubkeyNotAnsweringWithOKAuth(gtest, serverKeypair), {
                connectionTimeout: 100,
                requestTimeout: 100
              }));
              (await s2p).connect().catch((e:any) => logger.error('WS2P: newConnectionFromWebSocketServer connection error'))
              break
            case 3:

              resolveS3(WS2PConnection.newConnectionFromWebSocketServer(ws, new WS2PMutedHandler(), new WS2PPubkeyLocalAuth(gtest, serverKeypair, ""), new WS2PPubkeyRemoteAuth(gtest, serverKeypair), {
                connectionTimeout: 100,
                requestTimeout: 100
              }));
              (await s3p).connect().catch((e:any) => logger.error('WS2P: newConnectionFromWebSocketServer connection error'))
              break
            case 4:

              resolveS4(WS2PConnection.newConnectionFromWebSocketServer(ws, new WS2PMutedHandler(), new WS2PPubkeyLocalAuth(gtest, serverKeypair, ""), new WS2PPubkeyRemoteAuth(gtest, serverKeypair), {
                connectionTimeout: 100,
                requestTimeout: 100
              }));
              (await s4p).connect().catch((e:any) => logger.error('WS2P: newConnectionFromWebSocketServer connection error'))
              break

            case 5:
              resolveS5(WS2PConnection.newConnectionFromWebSocketServer(ws, new WS2PMutedHandler(), new WS2PPubkeyLocalAuth(gtest, serverKeypair, ""), new WS2PPubkeyRemoteAuth(gtest, serverKeypair)));
              (await s5p).connect().catch((e:any) => logger.error('WS2P: newConnectionFromWebSocketServer connection error'))
              break

            case 6:

              resolveS6(WS2PConnection.newConnectionFromWebSocketServer(ws, new WS2PMutedHandler(), new WS2PPubkeyLocalAuth(gtest, serverKeypair, ""), new WS2PPubkeyRemoteAuth(gtest, serverKeypair), {
                connectionTimeout: 100,
                requestTimeout: 100
              }));
              (await s6p).connect().catch((e:any) => logger.error('WS2P: newConnectionFromWebSocketServer connection error'))
              break
          }
          i++
        })
      })

      after((done) => {
        wss.close(done)
      })

      it('should refuse the connection if the client does not send ACK', async () => {

        class WS2PPubkeyNotAnsweringWithACKAuth extends WS2PPubkeyRemoteAuth {
          async sendACK(ws: any): Promise<void> {
            return Promise.resolve()
          }
        }

        const keypair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP')
        const c1 = WS2PConnection.newConnectionToAddress(1, 'ws://localhost:20903', new WS2PMutedHandler(), new WS2PPubkeyLocalAuth(gtest, keypair, ""), new WS2PPubkeyNotAnsweringWithACKAuth(gtest, keypair))
        c1.connect().catch((e:any) => logger.error('WS2P: connection error'))
        const s1 = await s1p
        await assertThrows(s1.request({ name: 'something' }), "WS2P connection timeout")
      })

      it('should refuse the connection if the client not confirm with OK', async () => {
        const keypair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP')
        WS2PConnection.newConnectionToAddress(1, 'ws://localhost:20903', new WS2PMutedHandler(), new WS2PPubkeyLocalAuth(gtest, keypair, ""), new WS2PPubkeyRemoteAuth(gtest, keypair))
        const s2 = await s2p
        await assertThrows(s2.request({ name: 'something' }), "WS2P connection timeout")
      })

      it('should refuse the connection if the client answers with a wrong signature', async () => {

        class WS2PPubkeyAnsweringWithWrongSigForACK extends WS2PPubkeyRemoteAuth {
          async sendACK(ws: any): Promise<void> {
            const challengeMessage = `WS2P:WRONG:${this.pair.pub}:${this.challenge}`
            const sig = this.pair.signSync(challengeMessage)
            await ws.send(JSON.stringify({
              auth: 'ACK',
              pub: this.pair.pub,
              sig
            }))
          }
        }

        const keypair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP')
        const c3 = WS2PConnection.newConnectionToAddress(1, 'ws://localhost:20903', new WS2PMutedHandler(), new WS2PPubkeyLocalAuth(gtest, keypair, ""), new WS2PPubkeyAnsweringWithWrongSigForACK(gtest, keypair))
        c3.connect().catch((e:any) => logger.error('WS2P: connection error'))
        const s3 = await s3p
        await assertThrows(s3.request({ name: 'something' }), "Wrong signature from server ACK")
      })

      it('should refuse the connection if the client refuses our signature', async () => {

        class WS2PPubkeyRefusingACKSignature extends WS2PPubkeyLocalAuth {

          async registerACK(sig: string, pub: string): Promise<boolean> {
            const challengeMessage = `WS2P:BLABLA:${pub}:${this.challenge}`
            this.authenticated = verify(challengeMessage, sig, pub)
            if (!this.authenticated) {
              this.serverAuthReject("Wrong signature from server ACK")
            } else {
              this.serverAuthResolve()
            }
            return this.authenticated
          }
        }

        const keypair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP')
        const c4 = WS2PConnection.newConnectionToAddress(1, 'ws://localhost:20903', new WS2PMutedHandler(), new WS2PPubkeyRefusingACKSignature(gtest, keypair, ""), new WS2PPubkeyRemoteAuth(gtest, keypair))
        const s4 = await s4p
        await assertThrows(c4.connect(), "Wrong signature from server ACK")
      })

      it('should accept the connection if everything is OK on both side', async () => {
        const keypair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP')
        const c5 = WS2PConnection.newConnectionToAddress(1, 'ws://localhost:20903', new (class TmpHandler implements WS2PMessageHandler {
          async handlePushMessage(json: any): Promise<void> {
          }
          async answerToRequest(json: any): Promise<WS2PResponse> {
            return { answer: 'success!' }
          }
        }), new WS2PPubkeyLocalAuth(gtest, keypair, ""), new WS2PPubkeyRemoteAuth(gtest, keypair))
        await c5.connect().catch((e:any) => logger.error('WS2P: connection error'))
        const s5 = await s5p
        assert.deepEqual({ answer: 'success!' }, await s5.request({ name: 'connection?'} ))
      })

      it('should refuse the connection if the client does not send OK', async () => {

        class WS2PPubkeyNotAnsweringWithOKAuth extends WS2PPubkeyLocalAuth {
          async sendOK(ws: any): Promise<void> {
          }
        }

        const keypair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP')
        const c6 = WS2PConnection.newConnectionToAddress(1, 'ws://localhost:20903', new WS2PMutedHandler(), new WS2PPubkeyNotAnsweringWithOKAuth(gtest, keypair, ""), new WS2PPubkeyRemoteAuth(gtest, keypair))
        c6.connect().catch((e:any) => logger.error('WS2P: connection error'))
        const s6 = await s6p
        await assertThrows(s6.request({ name: 'something' }), "WS2P connection timeout")
      })
    })
  })
})

/**************
 * TEST CLASSES
 *************/

class WS2PNoLocalAuth implements WS2PLocalAuth {

  async sendCONNECT(ws: any): Promise<void> {
  }

  async registerACK(sig: string, pub: string): Promise<boolean> {
    return true
  }

  isRemoteAuthenticated(): boolean {
    return true
  }

  async isAuthorizedPubkey(pub: string): Promise<boolean> {
    return true
  }

  async sendOK(ws: any): Promise<void> {
  }

  async authenticationIsDone(): Promise<void> {
  }
}

class WS2PNoRemoteAuth implements WS2PRemoteAuth {

  getPubkey(): string {
    return ""
  }

  async sendACK(ws: any): Promise<void> {
  }

  async registerCONNECT(version:number, challenge:string, sig: string, pub: string, ws2pId:string): Promise<boolean> {
    return true
  }

  async registerOK(sig: string): Promise<boolean> {
    return true
  }

  isAuthenticatedByRemote(): boolean {
    return true
  }

  async isAuthorizedPubkey(pub: string): Promise<boolean> {
    return true
  }

  async authenticationIsDone(): Promise<void> {
  }
}

class WS2PMutedHandler implements WS2PMessageHandler {

  async handlePushMessage(json: any): Promise<void> {
  }

  async answerToRequest(json: any): Promise<WS2PResponse> {
    throw "Does not answer"
  }
}

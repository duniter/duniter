import {WS2PConnection, WS2PNoAuth, WS2PPubkeyAuth} from "../../app/lib/ws2p/WS2PConnection"
import {Key, verify} from "../../app/lib/common-libs/crypto/keyring"
import {assertThrows} from "./tools/toolbox"
const assert = require('assert');
const WebSocketServer = require('ws').Server

describe('WS2P', () => {

  describe("WS2P client connection", function() {

    describe("no auth", () => {

      let wss:any

      before(async () => {
        wss = new WebSocketServer({ port: 20902 })
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
        const ws2p = WS2PConnection.newConnectionToAddress('localhost:20902', () => {}, new WS2PNoAuth(), new WS2PNoAuth())
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
            if (obj.reqId) {
              ws.send(JSON.stringify({ resId: obj.reqId, body: { bla: 'aa' } }))
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
        const ws2p = WS2PConnection.newConnectionToAddress('localhost:20903', () => {}, new WS2PPubkeyAuth(keypair), new WS2PPubkeyAuth(keypair), {
          connectionTimeout: 100,
          requestTimeout: 100
        })
        await assertThrows(ws2p.request({ message: 'a' }), "WS2P connection timeout")
      })

      it('should refuse the connection if the server answers with a wrong signature', async () => {
        const keypair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP')
        const ws2p = WS2PConnection.newConnectionToAddress('localhost:20903', () => {}, new WS2PPubkeyAuth(keypair), new WS2PPubkeyAuth(keypair), {
          connectionTimeout: 100,
          requestTimeout: 100
        })
        await assertThrows(ws2p.request({ message: 'a' }), "Wrong signature from server ACK")
      })

      it('should refuse the connection if the server refuses our signature', async () => {
        const keypair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP')
        const ws2p = WS2PConnection.newConnectionToAddress('localhost:20903', () => {}, new WS2PPubkeyAuth(keypair), new WS2PPubkeyAuth(keypair), {
          connectionTimeout: 100,
          requestTimeout: 100
        })
        await assertThrows(ws2p.request({ message: 'a' }), "WS2P connection timeout")
        assert.equal('Wrong signature from client ASK', clientAskError)
      })

      it('should accept the connection if the server answers with a good signature', async () => {
        const keypair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP')
        const ws2p = WS2PConnection.newConnectionToAddress('localhost:20903', () => {}, new WS2PPubkeyAuth(keypair), new WS2PPubkeyAuth(keypair), {
          connectionTimeout: 1000,
          requestTimeout: 1000
        })
        const res = await ws2p.request({ message: 'head' })
        assert.deepEqual({ bla: 'aa' }, res)
      })
    })
  })

  describe("WS2P server connection", function() {

    describe("no auth", () => {

      let wss:any
      let s1:WS2PConnection
      let s2:WS2PConnection

      before(async () => {
        let i = 0
        wss = new WebSocketServer({ port: 20902 })
        wss.on('connection', (ws:any) => {
          switch (i) {
            case 0:
              s1 = WS2PConnection.newConnectionFromWebSocketServer(ws, (obj:any, ws:any) => {
                if (obj.reqId) {
                  ws.send(JSON.stringify({ resId: obj.reqId, body: { answer: 'world' } }))
                }
              }, new WS2PNoAuth(), new WS2PNoAuth())
              s1.connect().catch(e => console.error('WS2P: newConnectionFromWebSocketServer connection error'))
              break
            case 1:
              let j = 0
              s2 = WS2PConnection.newConnectionFromWebSocketServer(ws, (obj:any, ws:any) => {
                if (obj.reqId) {
                  ws.send(JSON.stringify({ resId: obj.reqId, body: { answer: 'this is s2![j = ' + j + ']' } }))
                  j++
                }
              }, new WS2PNoAuth(), new WS2PNoAuth())
              s2.connect().catch(e => console.error('WS2P: newConnectionFromWebSocketServer connection error'))
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
        const c1 = WS2PConnection.newConnectionToAddress('localhost:20902', () => {}, new WS2PNoAuth(), new WS2PNoAuth())
        assert.deepEqual({ answer: 'world' }, await c1.request({ message: 'hello!' }))
        assert.deepEqual({ answer: 'world' }, await c1.request({ message: 'hello2!' }))
        assert.equal(s1.nbRequests, 0)
        assert.equal(c1.nbRequests, 2)
        assert.equal(s1.nbResponses, 0)
        assert.equal(c1.nbResponses, 2)
        assert.equal(s1.nbPushsToRemote, 0)
        assert.equal(c1.nbPushsToRemote, 0)
        assert.equal(s1.nbPushsByRemote, 0)
        assert.equal(c1.nbPushsByRemote, 0)
        // connection 2
        const c2 = WS2PConnection.newConnectionToAddress('localhost:20902', () => {}, new WS2PNoAuth(), new WS2PNoAuth())
        assert.deepEqual({ answer: 'this is s2![j = 0]' }, await c2.request({ message: 'test?' }))
        assert.deepEqual({ answer: 'this is s2![j = 1]' }, await c2.request({ message: 'test!' }))
        assert.deepEqual({ answer: 'this is s2![j = 2]' }, await c2.request({ message: 'test!!!' }))
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
      let s1p:Promise<WS2PConnection> = new Promise(res => resolveS1 = res)
      let s2p:Promise<WS2PConnection> = new Promise(res => resolveS2 = res)
      let s3p:Promise<WS2PConnection> = new Promise(res => resolveS3 = res)
      let s4p:Promise<WS2PConnection> = new Promise(res => resolveS4 = res)
      let s5p:Promise<WS2PConnection> = new Promise(res => resolveS5 = res)

      before(async () => {
        let i = 1
        wss = new WebSocketServer({ port: 20903 })
        const serverKeypair = new Key('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F')
        wss.on('connection', async (ws:any) => {
          switch (i) {
            case 1:
              resolveS1(WS2PConnection.newConnectionFromWebSocketServer(ws, () => {}, new WS2PPubkeyAuth(serverKeypair), new WS2PPubkeyAuth(serverKeypair), {
                connectionTimeout: 1000,
                requestTimeout: 1000
              }));
              (await s1p).connect().catch((e:any) => console.error('WS2P: newConnectionFromWebSocketServer connection error'))
              break
            case 2:

            class WS2PPubkeyNotAnsweringWithOKAuth extends WS2PPubkeyAuth {
              async registerClientOK(sig: string): Promise<boolean> {
                return Promise.resolve(true)
              }
            }

              resolveS2(WS2PConnection.newConnectionFromWebSocketServer(ws, () => {}, new WS2PPubkeyAuth(serverKeypair), new WS2PPubkeyNotAnsweringWithOKAuth(serverKeypair), {
                connectionTimeout: 1000,
                requestTimeout: 1000
              }));
              (await s2p).connect().catch((e:any) => console.error('WS2P: newConnectionFromWebSocketServer connection error'))
              break
            case 3:

              resolveS3(WS2PConnection.newConnectionFromWebSocketServer(ws, () => {}, new WS2PPubkeyAuth(serverKeypair), new WS2PPubkeyAuth(serverKeypair), {
                connectionTimeout: 1000,
                requestTimeout: 1000
              }));
              (await s3p).connect().catch((e:any) => console.error('WS2P: newConnectionFromWebSocketServer connection error'))
              break
            case 4:

              resolveS4(WS2PConnection.newConnectionFromWebSocketServer(ws, () => {}, new WS2PPubkeyAuth(serverKeypair), new WS2PPubkeyAuth(serverKeypair), {
                connectionTimeout: 1000,
                requestTimeout: 1000
              }));
              (await s4p).connect().catch((e:any) => console.error('WS2P: newConnectionFromWebSocketServer connection error'))
              break

            case 5:
              resolveS5(WS2PConnection.newConnectionFromWebSocketServer(ws, () => {}, new WS2PPubkeyAuth(serverKeypair), new WS2PPubkeyAuth(serverKeypair)));
              (await s5p).connect().catch((e:any) => console.error('WS2P: newConnectionFromWebSocketServer connection error'))
              break
          }
          i++
        })
      })

      after((done) => {
        wss.close(done)
      })

      it('should refuse the connection if the client does not acknowledge', async () => {

        class WS2PPubkeyNotAnsweringWithACKAuth extends WS2PPubkeyAuth {
          async acknowledge(ws: any): Promise<void> {
            return Promise.resolve()
          }
        }

        const keypair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP')
        const c1 = WS2PConnection.newConnectionToAddress('localhost:20903', () => {}, new WS2PPubkeyAuth(keypair), new WS2PPubkeyNotAnsweringWithACKAuth(keypair))
        await c1.connect()
        const s1 = await s1p
        await assertThrows(s1.request({ message: 'something' }), "WS2P connection timeout")
      })

      it('should refuse the connection if the client not confirm with OK', async () => {
        const keypair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP')
        WS2PConnection.newConnectionToAddress('localhost:20903', () => {}, new WS2PPubkeyAuth(keypair), new WS2PPubkeyAuth(keypair))
        const s2 = await s2p
        await assertThrows(s2.request({ message: 'something' }), "WS2P connection timeout")
      })

      it('should refuse the connection if the client answers with a wrong signature', async () => {

        class WS2PPubkeyAnsweringWithWrongSigForACK extends WS2PPubkeyAuth {
          async acknowledge(ws: any): Promise<void> {
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
        const c3 = WS2PConnection.newConnectionToAddress('localhost:20903', () => {}, new WS2PPubkeyAuth(keypair), new WS2PPubkeyAnsweringWithWrongSigForACK(keypair))
        await c3.connect()
        const s3 = await s3p
        await assertThrows(s3.request({ message: 'something' }), "Wrong signature from server ACK")
      })

      it('should refuse the connection if the client refuses our signature', async () => {

        class WS2PPubkeyRefusingACKSignature extends WS2PPubkeyAuth {

          registerServerACK(sig: string, pub: string): boolean {
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
        const c4 = WS2PConnection.newConnectionToAddress('localhost:20903', () => {}, new WS2PPubkeyRefusingACKSignature(keypair), new WS2PPubkeyAuth(keypair))
        const s4 = await s4p
        await assertThrows(c4.connect(), "Wrong signature from server ACK")
      })

      it('should accept the connection if everything is OK on both side', async () => {
        const keypair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP')
        const c5 = WS2PConnection.newConnectionToAddress('localhost:20903', (obj:any, ws:any) => {
          if (obj.reqId) {
            ws.send(JSON.stringify({ resId: obj.reqId, body: { answer: 'success!' } }))
          }
        }, new WS2PPubkeyAuth(keypair), new WS2PPubkeyAuth(keypair))
        await c5.connect()
        const s5 = await s5p
        assert.deepEqual({ answer: 'success!' }, await s5.request({ message: 'connection?'} ))
      })
    })
  })
})
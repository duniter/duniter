import {Key, verify} from "../common-libs/crypto/keyring"
const ws = require('ws')
const nuuid = require('node-uuid');

const MAXIMUM_ERRORS_COUNT = 5
const REQUEST_TIMEOUT_VALUE = 1000 * 5 // 10 seconds

enum WS2P_ERR {
  INCORRECT_SIGNATURE_FROM_SERVER,
  MUST_BE_AUTHENTICATED_FIRST,
  ALREADY_AUTHENTICATED,
  AUTH_INVALID_SIG_PUB,
  REQUEST_FAILED,
  MESSAGE_MUST_BE_AN_OBJECT,
  ANSWER_TO_UNDEFINED_REQUEST
}

export interface WS2PAuth {
  authAsClient(ws:any): Promise<void>
  authAsServer(ws:any): Promise<void>
  registerClientASK(challenge:string, sig: string, pub: string): Promise<boolean>
  registerServerACK(sig:string, pub:string): boolean
  isAuthenticated(): boolean
  isAuthorizedPubkey(pub:string): Promise<boolean>
}

export class WS2PNoAuth implements WS2PAuth {

  authAsClient(ws: any): Promise<void> {
    return Promise.resolve()
  }

  authAsServer(ws: any): Promise<void> {
    return Promise.resolve()
  }

  registerClientASK(challenge:string, sig: string, pub: string): Promise<boolean> {
    return Promise.resolve(true)
  }

  registerServerACK(sig: string, pub: string): boolean {
    return true
  }

  isAuthenticated(): boolean {
    return true
  }

  isAuthorizedPubkey(pub: string): Promise<boolean> {
    return Promise.resolve(true)
  }
}

export class WS2PPubkeyAuth implements WS2PAuth {

  private challenge:string
  private authenticated = false
  private serverAuth:Promise<void>
  private serverAuthResolve:()=>void
  private serverAuthReject:(err:any)=>void

  constructor(private pair:Key) {
    this.challenge = nuuid.v4() + nuuid.v4()
    this.serverAuth = new Promise((resolve, reject) => {
      this.serverAuthResolve = resolve
      this.serverAuthReject = reject
    })
  }

  async authAsClient(ws: any): Promise<void> {
    const challengeMessage = `WS2P:ASK:${this.pair.pub}:${this.challenge}`
    const sig = this.pair.signSync(challengeMessage)
    await ws.send(JSON.stringify({
      auth: 'ASK',
      pub: this.pair.pub,
      challenge: this.challenge,
      sig
    }))
    return this.serverAuth
  }

  async authAsServer(ws: any): Promise<void> {
    const challengeMessage = `WS2P:ACK:${this.pair.pub}:${this.challenge}`
    const sig = this.pair.sign(challengeMessage)
    await ws.send(JSON.stringify({
      auth: 'ACK',
      pub: this.pair.pub,
      sig
    }))
    return this.serverAuth
  }

  async registerClientASK(challenge:string, sig: string, pub: string): Promise<boolean> {
    const allow = await this.isAuthorizedPubkey(pub)
    if (!allow) {
      return false
    }
    this.challenge = challenge
    const challengeMessage = `WS2P:ASK:${pub}:${challenge}`
    this.authenticated = verify(challengeMessage, sig, pub)
    return this.authenticated
  }

  registerServerACK(sig: string, pub: string): boolean {
    const challengeMessage = `WS2P:ACK:${pub}:${this.challenge}`
    this.authenticated = verify(challengeMessage, sig, pub)
    if (!this.authenticated) {
      this.serverAuthReject("Wrong signature from server ACK")
    } else {
      this.serverAuthResolve()
    }
    return this.authenticated
  }

  isAuthenticated(): boolean {
    return this.authenticated
  }

  isAuthorizedPubkey(pub: string): Promise<boolean> {
    return Promise.resolve(true)
  }
}

export interface WS2PRequest {
  message:string
}

/**
 * Symmetrical connection: the same class is used both for server and client
 */
export class WS2PHeadReq implements WS2PRequest {
  message = "head"
}

export class WS2PConnection {

  private nbErrors = 0
  private ws:any
  private exchanges:{
    [uuid:string]: {
      promise: Promise<any>,
      extras: {
        resolve: (data:any) => void
        reject: (err:any) => void
      }
    }
  } = {}

  constructor(
    private onPushMessage:(json:any)=>void,
    private authentication:WS2PAuth,
    private options:{
      connectionTimeout:number
      requestTimeout:number
    } = {
      connectionTimeout: REQUEST_TIMEOUT_VALUE,
      requestTimeout: REQUEST_TIMEOUT_VALUE
    }
  ) {}

  async connect(address:string) {
    const protocol = address.match(/:443$/) ? 'wss' : 'ws'
    this.ws = new ws(protocol + '://' + address)
    const connectionTimeout = new Promise((res, rej) => {
      setTimeout(() => {
        rej("WS2P connection timeout")
      }, this.options.connectionTimeout)
    })
    return Promise.race([connectionTimeout, new Promise((resolve, reject) => {

      this.ws.on('open', async () => {
        try {
          await this.authentication.authAsClient(this.ws)
          resolve()
        } catch (e) {
          reject(e)
        }
      })

      this.ws.on('message', async (msg:any) => {
        const data = JSON.parse(msg)
        if (typeof data !== 'object') {
          // We only accept JSON objects
          await this.errorDetected(WS2P_ERR.MESSAGE_MUST_BE_AN_OBJECT)

        } else if (data.auth && typeof data.auth === "string") {

          // Client considering its auth by the server
          if (data.auth === "ACK") {
            if (this.authentication.isAuthenticated()) {
              return this.errorDetected(WS2P_ERR.ALREADY_AUTHENTICATED)
            }
            if (typeof data.pub !== "string" || typeof data.pub !== "string") {
              await this.errorDetected(WS2P_ERR.AUTH_INVALID_SIG_PUB)
            } else {
              try {
                await this.authentication.registerServerACK(data.sig, data.pub)
              } catch (e) {
                await this.errorDetected(WS2P_ERR.INCORRECT_SIGNATURE_FROM_SERVER)
              }
            }
          }

        } else {
          if (!this.authentication.isAuthenticated()) {
            await this.errorDetected(WS2P_ERR.MUST_BE_AUTHENTICATED_FIRST)
          } else if (data.uuid && typeof data.uuid === "string") {
            // An answer
            const request = this.exchanges[data.uuid]
            if (request !== undefined) {
              request.extras.resolve(data.body)
            } else {
              await this.errorDetected(WS2P_ERR.ANSWER_TO_UNDEFINED_REQUEST)
            }
          } else {
            // A push message
            this.onPushMessage(data)
          }
        }
      })
    })])
  }

  async request(body:WS2PRequest) {
    const uuid = nuuid.v4()
    if (!this.ws) {
      throw Error("Use .connect() method before sending a message.")
    }
    return new Promise((resolve, reject) => {
      this.ws.send(JSON.stringify({
        uuid,
        body
      }), async (err:any) => {
        if (err) {
          return reject(err)
        } else {
          // The request was successfully sent. Now wait for the answer.
          const extras = {
            resolve: () => { console.error('resolution not implemented') },
            reject:  (err:any) => { console.error('rejection not implemented') }
          }
          this.exchanges[uuid] = {
            extras,
            promise: Promise.race([
              // The answer
              new Promise((res, rej) => {
                extras.resolve = res
                extras.reject = (err:any) => {
                  this.errorDetected(WS2P_ERR.REQUEST_FAILED)
                  rej(err)
                }
              }),
              // Timeout
              new Promise((res, rej) => {
                setTimeout(() => {
                  rej("WS2P request timeout")
                }, this.options.requestTimeout)
              })
            ])
          }
          try {
            resolve(await this.exchanges[uuid].promise)
          } catch(e) {
            reject(e)
          }
        }
      })
    })
  }

  private async errorDetected(cause:WS2P_ERR) {
    this.nbErrors++
    if (this.nbErrors >= MAXIMUM_ERRORS_COUNT) {
      this.ws.terminate()
    }
  }
}
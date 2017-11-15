import {Key, verify} from "../../../lib/common-libs/crypto/keyring"
import {WS2PMessageHandler} from "./impl/WS2PMessageHandler"
import {BlockDTO} from "../../../lib/dto/BlockDTO"
import {IdentityDTO} from "../../../lib/dto/IdentityDTO"
import {CertificationDTO} from "../../../lib/dto/CertificationDTO"
import {MembershipDTO} from "../../../lib/dto/MembershipDTO"
import {TransactionDTO} from "../../../lib/dto/TransactionDTO"
import {PeerDTO} from "../../../lib/dto/PeerDTO"
import {WS2PConstants} from "./constants"
import { ProxiesConf } from '../../../lib/proxy';
const ws = require('ws')
const SocksProxyAgent = require('socks-proxy-agent');
const nuuid = require('node-uuid');
const logger = require('../../../lib/logger').NewLogger('ws2p')

const MAXIMUM_ERRORS_COUNT = 5
const REQUEST_TIMEOUT_VALUE = WS2PConstants.REQUEST_TIMEOUT

enum WS2P_ERR {
  REJECTED_PUBKEY_OR_INCORRECT_ASK_SIGNATURE_FROM_REMOTE,
  AUTH_INVALID_ASK_FIELDS,
  AUTH_INVALID_ACK_FIELDS,
  AUTH_INVALID_OK_FIELDS,
  INCORRECT_ACK_SIGNATURE_FROM_REMOTE,
  INCORRECT_ASK_SIGNATURE_FROM_REMOTE,
  UNKNOWN_AUTH_MESSAGE,
  ALREADY_AUTHENTICATED_AND_CONFIRMED_BY_REMOTE,
  ALREADY_AUTHENTICATED_REMOTE,
  ALREADY_AUTHENTICATED_BY_REMOTE,
  INCORRECT_PUBKEY_FOR_REMOTE,
  MUST_BE_AUTHENTICATED_FIRST,
  REQUEST_FAILED,
  MESSAGE_MUST_BE_AN_OBJECT,
  ANSWER_TO_UNDEFINED_REQUEST
}

export enum WS2P_PUSH {
  PEER,
  TRANSACTION,
  MEMBERSHIP,
  CERTIFICATION,
  IDENTITY,
  BLOCK,
  HEAD
}

export interface WS2PAuth {
  authenticationIsDone(): Promise<void>
}

export interface WS2PRemoteAuth extends WS2PAuth {
  registerCONNECT(ws2pVersion:number, challenge:string, sig: string, pub: string, ws2pId:string): Promise<boolean>
  sendACK(ws:any): Promise<void>
  registerOK(sig: string): Promise<boolean>
  isAuthenticatedByRemote(): boolean
  getPubkey(): string
}

export interface WS2PLocalAuth extends WS2PAuth {
  sendCONNECT(ws:any, ws2pVersion:number): Promise<void>
  registerACK(sig: string, pub: string): Promise<boolean>
  sendOK(ws:any): Promise<void>
  isRemoteAuthenticated(): boolean
}

/**
 * A passive authenticator based on our keyring.
 */
export class WS2PPubkeyRemoteAuth implements WS2PRemoteAuth {

  protected challenge:string
  protected authenticatedByRemote = false
  protected remotePub = ""
  protected remoteWs2pId = ""
  protected remoteVersion = 1
  protected serverAuth:Promise<void>
  protected serverAuthResolve:()=>void
  protected serverAuthReject:(err:any)=>void

  constructor(
    protected currency:string,
    protected pair:Key,
    protected tellIsAuthorizedPubkey:(pub: string) => Promise<boolean> = () => Promise.resolve(true)
  ) {
    this.challenge = nuuid.v4() + nuuid.v4()
    this.serverAuth = new Promise((resolve, reject) => {
      this.serverAuthResolve = resolve
      this.serverAuthReject = reject
    })
  }

  getPubkey() {
    return this.remotePub
  }

  async sendACK(ws: any): Promise<void> {
    const challengeMessage = `WS2P:ACK:${this.currency}:${this.pair.pub}:${this.challenge}`
    Logger.log('sendACK >>> ' + challengeMessage)
    const sig = this.pair.signSync(challengeMessage)
    await ws.send(JSON.stringify({
      auth: 'ACK',
      pub: this.pair.pub,
      sig
    }))
  }

  async registerCONNECT(ws2pVersion:number, challenge:string, sig: string, pub: string, ws2pId:string = ""): Promise<boolean> {
    const allow = await this.tellIsAuthorizedPubkey(pub)
    if (!allow) {
      return false
    }
    const challengeMessage = (ws2pVersion > 1) ? `WS2P:CONNECT:${this.currency}:${pub}:${ws2pId}:${challenge}`:`WS2P:CONNECT:${this.currency}:${pub}:${challenge}`
    Logger.log('registerCONNECT >>> ' + challengeMessage)
    const verified = verify(challengeMessage, sig, pub)
    if (verified) {
      this.remoteVersion = ws2pVersion
      this.challenge = challenge
      this.remotePub = pub
      this.remoteWs2pId = ws2pId
    }
    return verified
  }

  async registerOK(sig: string): Promise<boolean> {
    const challengeMessage = `WS2P:OK:${this.currency}:${this.remotePub}:${this.challenge}`
    Logger.log('registerOK >>> ' + challengeMessage)
    this.authenticatedByRemote = verify(challengeMessage, sig, this.remotePub)
    if (!this.authenticatedByRemote) {
      this.serverAuthReject("Wrong signature from remote OK")
    } else {
      this.serverAuthResolve()
    }
    return this.authenticatedByRemote
  }

  isAuthenticatedByRemote(): boolean {
    return this.authenticatedByRemote
  }

  authenticationIsDone(): Promise<void> {
    return this.serverAuth
  }
}

/**
 * An connecting authenticator based on our keyring.
 */
export class WS2PPubkeyLocalAuth implements WS2PLocalAuth {

  protected challenge:string
  protected authenticated = false
  protected serverAuth:Promise<void>
  protected serverAuthResolve:()=>void
  protected serverAuthReject:(err:any)=>void

  constructor(
    protected currency:string,
    protected pair:Key,
    protected ws2pId:string,
    protected tellIsAuthorizedPubkey:(pub: string) => Promise<boolean> = () => Promise.resolve(true)
  ) {
    this.challenge = nuuid.v4() + nuuid.v4()
    this.serverAuth = new Promise((resolve, reject) => {
      this.serverAuthResolve = resolve
      this.serverAuthReject = reject
    })
  }

  async sendCONNECT(ws:any, ws2pVersion:number): Promise<void> {
    if (ws2pVersion > 1) {
      const challengeMessage = `WS2P:${ws2pVersion}:CONNECT:${this.currency}:${this.pair.pub}:${this.ws2pId}:${this.challenge}`
      Logger.log('sendCONNECT >>> ' + challengeMessage)
      const sig = this.pair.signSync(challengeMessage)
      await ws.send(JSON.stringify({
        auth: 'CONNECT',
        version: ws2pVersion,
        pub: this.pair.pub,
        ws2pid: this.ws2pId,
        challenge: this.challenge,
        sig
      }))
      return this.serverAuth
    } else if (ws2pVersion == 1) {
      const challengeMessage = `WS2P:CONNECT:${this.currency}:${this.pair.pub}:${this.challenge}`
      Logger.log('sendCONNECT >>> ' + challengeMessage)
      const sig = this.pair.signSync(challengeMessage)
      await ws.send(JSON.stringify({
        auth: 'CONNECT',
        pub: this.pair.pub,
        challenge: this.challenge,
        sig
      }))
      return this.serverAuth
    }
  }

  async registerACK(sig: string, pub: string): Promise<boolean> {
    const allow = await this.tellIsAuthorizedPubkey(pub)
    if (!allow) {
      return false
    }
    const challengeMessage = `WS2P:ACK:${this.currency}:${pub}:${this.challenge}`
    Logger.log('registerACK >>> ' + challengeMessage)
    this.authenticated = verify(challengeMessage, sig, pub)
    if (!this.authenticated) {
      this.serverAuthReject("Wrong signature from server ACK")
    } else {
      this.serverAuthResolve()
    }
    return this.authenticated
  }

  async sendOK(ws:any): Promise<void> {
    const challengeMessage = `WS2P:OK:${this.currency}:${this.pair.pub}:${this.challenge}`
    Logger.log('sendOK >>> ' + challengeMessage)
    const sig = this.pair.signSync(challengeMessage)
    await ws.send(JSON.stringify({
      auth: 'OK',
      sig
    }))
    return this.serverAuth
  }

  isRemoteAuthenticated(): boolean {
    return this.authenticated
  }

  authenticationIsDone(): Promise<void> {
    return this.serverAuth
  }
}

export interface WS2PRequest {
  name:string,
  params?:any
}

/**
 * The handler of a WS2P connection.
 *
 * Goal: operating an authenticated bidirectionnal communication over a WebSocket connection.
 * Requires an established WebSocket connection in order to work.
 */
export class WS2PConnection {

  private connectp:Promise<any>|undefined
  private connectedp:Promise<string>
  private connectedResolve:(pub:string)=>void
  private connectedReject:(e:any)=>void
  private nbErrors = 0
  private nbRequestsCount = 0
  private nbResponsesCount = 0
  private nbPushsToRemoteCount = 0
  private nbPushsByRemoteCount = 0
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
    private ws2pVersion:number,
    private ws:any,
    private onWsOpened:Promise<void>,
    private onWsClosed:Promise<void>,
    private messageHandler:WS2PMessageHandler,
    private localAuth:WS2PLocalAuth,
    private remoteAuth:WS2PRemoteAuth,
    private options:{
      connectionTimeout:number
      requestTimeout:number
    } = {
      connectionTimeout: REQUEST_TIMEOUT_VALUE,
      requestTimeout: REQUEST_TIMEOUT_VALUE
    },
    private expectedPub:string = "",
    private expectedWS2PUID:string = ""
  ) {
    this.connectedp = new Promise((resolve, reject) => {
      this.connectedResolve = resolve
      this.connectedReject = reject
    })
  }

  static newConnectionToAddress(
    ws2pVersion:number,
    address:string,
    messageHandler:WS2PMessageHandler,
    localAuth:WS2PLocalAuth,
    remoteAuth:WS2PRemoteAuth,
    proxySocksAddress:string|undefined = undefined,
    options:{
      connectionTimeout:number,
      requestTimeout:number
    } = {
      connectionTimeout: REQUEST_TIMEOUT_VALUE,
      requestTimeout: REQUEST_TIMEOUT_VALUE
    },
    expectedPub:string = "", 
    expectedWS2PUID:string = "") {
      if (address.match(WS2PConstants.FULL_ADDRESS_ONION_REGEX)) {
        options = {
          connectionTimeout: WS2PConstants.CONNEXION_TOR_TIMEOUT,
          requestTimeout: WS2PConstants.REQUEST_TOR_TIMEOUT
        }
      }
      const websocket = (proxySocksAddress !== undefined) ? new ws(address, { agent: SocksProxyAgent("socks://"+proxySocksAddress) }):new ws(address)
    const onWsOpened:Promise<void> = new Promise(res => {
      websocket.on('open', () => res())
    })
    const onWsClosed:Promise<void> = new Promise(res => {
      websocket.on('close', () => res())
    })
    websocket.on('error', () => websocket.close())
    return new WS2PConnection(ws2pVersion, websocket, onWsOpened, onWsClosed, messageHandler, localAuth, remoteAuth, options, expectedPub, expectedWS2PUID)
  }

  static newConnectionFromWebSocketServer(
    websocket:any,
    messageHandler:WS2PMessageHandler,
    localAuth:WS2PLocalAuth,
    remoteAuth:WS2PRemoteAuth,
    options:{
      connectionTimeout:number
      requestTimeout:number
    } = {
      connectionTimeout: REQUEST_TIMEOUT_VALUE,
      requestTimeout: REQUEST_TIMEOUT_VALUE
    },
    expectedPub:string = "") {
    const onWsOpened = Promise.resolve()
    const onWsClosed:Promise<void> = new Promise(res => {
      websocket.on('close', () => res())
    })
    return new WS2PConnection(WS2PConstants.WS2P_DEFAULT_VERSION, websocket, onWsOpened, onWsClosed, messageHandler, localAuth, remoteAuth, options, expectedPub)
  }

  get pubkey() {
    return this.remoteAuth.getPubkey()
  }

  get uuid() {
    return this.expectedWS2PUID
  }

  get nbRequests() {
    return this.nbRequestsCount
  }

  get nbResponses() {
    return this.nbResponsesCount
  }

  get nbPushsToRemote() {
    return this.nbPushsToRemoteCount
  }

  get nbPushsByRemote() {
    return this.nbPushsByRemoteCount
  }

  get connected() {
    return this.connectedp
  }

  get closed() {
    return this.onWsClosed
  }

  close() {
    return this.ws.close()
  }

  async connect() {
    if (!this.connectp) {
      this.connectp = (async () => {
        const connectionTimeout = new Promise((res, rej) => {
          setTimeout(() => {
            rej("WS2P connection timeout")
          }, this.options.connectionTimeout)
        })
        try {
          await Promise.race([connectionTimeout, new Promise((resolve, reject) => {

            (async () => {
              await this.onWsOpened
              try {
                await this.localAuth.sendCONNECT(this.ws, this.ws2pVersion)
                await Promise.all([
                  this.localAuth.authenticationIsDone(),
                  this.remoteAuth.authenticationIsDone()
                ])
                resolve()
              } catch (e) {
                reject(e)
              }
            })()

            this.ws.on('message', async (msg:string) => {
              const data = JSON.parse(msg)

              // Incorrect data
              if (typeof data !== 'object') {
                // We only accept JSON objects
                await this.errorDetected(WS2P_ERR.MESSAGE_MUST_BE_AN_OBJECT)
              }

              // OK: JSON object
              else {

                /************************
                 * CONNECTION STUFF
                 ************************/

                if (data.auth && typeof data.auth === "string") {

                  if (data.auth === "CONNECT") {
                    if (data.version) {
                      if (typeof data.version !== "number") {
                        await this.errorDetected(WS2P_ERR.AUTH_INVALID_ASK_FIELDS)
                      } else {
                        this.ws2pVersion = data.version
                      }
                    }
                    if (this.remoteAuth.isAuthenticatedByRemote()) {
                      return this.errorDetected(WS2P_ERR.ALREADY_AUTHENTICATED_BY_REMOTE)
                    }
                    else if (
                      typeof data.pub !== "string" || typeof data.sig !== "string" || typeof data.challenge !== "string" || (this.ws2pVersion > 1 && typeof data.ws2pId !== "string") ) {
                      await this.errorDetected(WS2P_ERR.AUTH_INVALID_ASK_FIELDS)
                    } else {
                      if (this.expectedPub && data.pub !== this.expectedPub) {
                        await this.errorDetected(WS2P_ERR.INCORRECT_PUBKEY_FOR_REMOTE)
                      } else {
                        const valid = await this.remoteAuth.registerCONNECT(this.ws2pVersion, data.challenge, data.sig, data.pub, (this.ws2pVersion > 1) ? data.ws2pID:"")
                        if (valid) {
                          await this.remoteAuth.sendACK(this.ws)
                        } else {
                          await this.errorDetected(WS2P_ERR.REJECTED_PUBKEY_OR_INCORRECT_ASK_SIGNATURE_FROM_REMOTE)
                        }
                      }
                    }
                  }

                  else if (data.auth === "ACK") {
                    if (this.localAuth.isRemoteAuthenticated()) {
                      return this.errorDetected(WS2P_ERR.ALREADY_AUTHENTICATED_REMOTE)
                    }
                    if (typeof data.pub !== "string" || typeof data.sig !== "string") {
                      await this.errorDetected(WS2P_ERR.AUTH_INVALID_ACK_FIELDS)
                    } else {
                      if (this.expectedPub && data.pub !== this.expectedPub) {
                        await this.errorDetected(WS2P_ERR.INCORRECT_PUBKEY_FOR_REMOTE)
                      } else {
                        try {
                          const valid = await this.localAuth.registerACK(data.sig, data.pub)
                          if (valid) {
                            await this.localAuth.sendOK(this.ws)
                          }
                        } catch (e) {
                          await this.errorDetected(WS2P_ERR.INCORRECT_ACK_SIGNATURE_FROM_REMOTE)
                        }
                      }
                    }
                  }

                  else if (data.auth === "OK") {
                    if (this.remoteAuth.isAuthenticatedByRemote()) {
                      return this.errorDetected(WS2P_ERR.ALREADY_AUTHENTICATED_AND_CONFIRMED_BY_REMOTE)
                    }
                    if (typeof data.sig !== "string") {
                      await this.errorDetected(WS2P_ERR.AUTH_INVALID_OK_FIELDS)
                    } else {
                      await this.remoteAuth.registerOK(data.sig)
                    }
                  }

                  else {
                    await this.errorDetected(WS2P_ERR.UNKNOWN_AUTH_MESSAGE)
                  }
                }

                /************************
                 * APPLICATION STUFF
                 ************************/

                else {

                  if (!this.localAuth.isRemoteAuthenticated()) {
                    await this.errorDetected(WS2P_ERR.MUST_BE_AUTHENTICATED_FIRST)
                  }

                  // Request message
                  else if (data.reqId && typeof data.reqId === "string") {
                    try {
                      const answer = await this.messageHandler.answerToRequest(data.body)
                      this.ws.send(JSON.stringify({ resId: data.reqId, body: answer }))
                    } catch (e) {
                      this.ws.send(JSON.stringify({ resId: data.reqId, err: e }))
                    }
                  }

                  // Answer message
                  else if (data.resId && typeof data.resId === "string") {
                    // An answer
                    const request = this.exchanges[data.resId]
                    this.nbResponsesCount++
                    if (request !== undefined) {
                      request.extras.resolve(data.body)
                    } else {
                      await this.errorDetected(WS2P_ERR.ANSWER_TO_UNDEFINED_REQUEST)
                    }
                  }

                  // Push message
                  else {
                    this.nbPushsByRemoteCount++
                    await this.messageHandler.handlePushMessage(data, this)
                  }
                }
              }
            })
          })])

          this.connectedResolve(this.remoteAuth.getPubkey())
        } catch (e) {
          this.connectedReject(e)
          await this.connectedp
        }
      })()
    }
    return this.connectp
  }

  async request(body:WS2PRequest) {
    await this.connect()
    const uuid = nuuid.v4()
    return new Promise((resolve, reject) => {
      this.nbRequestsCount++
      this.ws.send(JSON.stringify({
        reqId: uuid,
        body
      }), async (err:any) => {
        if (err) {
          return reject(err)
        } else {
          // The request was successfully sent. Now wait for the answer.
          const extras = {
            resolve: () => { console.error('resolution not implemented') },
            reject:  () => { console.error('rejection not implemented') }
          }
          this.exchanges[uuid] = {
            extras,
            promise: Promise.race([
              // The answer
              new Promise((res, rej) => {
                extras.resolve = res
                extras.reject = () => {
                  this.errorDetected(WS2P_ERR.REQUEST_FAILED)
                  rej()
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

  async pushBlock(block:BlockDTO) {
    return this.pushData(WS2P_PUSH.BLOCK, 'block', block)
  }

  async pushIdentity(idty:IdentityDTO) {
    return this.pushData(WS2P_PUSH.IDENTITY, 'identity', idty)
  }

  async pushCertification(cert:CertificationDTO) {
    return this.pushData(WS2P_PUSH.CERTIFICATION, 'certification', cert)
  }

  async pushMembership(ms:MembershipDTO) {
    return this.pushData(WS2P_PUSH.MEMBERSHIP, 'membership', ms)
  }

  async pushTransaction(tx:TransactionDTO) {
    return this.pushData(WS2P_PUSH.TRANSACTION, 'transaction', tx)
  }

  async pushPeer(peer:PeerDTO) {
    return this.pushData(WS2P_PUSH.PEER, 'peer', peer)
  }

  async pushHeads(heads:{ message:string, sig:string }[]) {
    return this.pushData(WS2P_PUSH.HEAD, 'heads', heads)
  }

  async pushData(type:WS2P_PUSH, key:string, data:any) {
    await this.connect()
    return new Promise((resolve, reject) => {
      this.nbPushsToRemoteCount++
      try {
        this.ws.send(JSON.stringify({
          body: {
            name: WS2P_PUSH[type],
            [key]: data
          }
        }), async (err:any) => {
          if (err) {
            return reject(err)
          }
          resolve()
        })
      } catch (e) {
        reject(e)
      }
    })
  }

  private errorDetected(cause:WS2P_ERR) {
    this.nbErrors++
    Logger.error('>>> WS ERROR: %s', WS2P_ERR[cause])
    if (this.nbErrors >= MAXIMUM_ERRORS_COUNT) {
      this.ws.terminate()
    }
  }
}

class Logger {

  static log(message:string) {
    logger.trace('WS2P >>> ' + message)
  }

  static error(message:string, obj:any) {
    logger.error('WS2P >>> ' + message, obj)
  }
}
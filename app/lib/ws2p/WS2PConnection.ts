
const ws = require('ws')
const nuuid = require('node-uuid');

const MAXIMUM_ERRORS_COUNT = 5
const REQUEST_TIMEOUT_VALUE = 1000 * 5 // 10 seconds

enum WS2P_ERR {
  REQUEST_FAILED,
  MESSAGE_MUST_BE_AN_OBJECT,
  ANSWER_TO_UNDEFINED_REQUEST,
  REQUEST_TIMEOUT
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
    private onPushMessage:(json:any)=>void) {
  }

  async connect(address:string) {
    const protocol = address.match(/:443$/) ? 'wss' : 'ws'
    this.ws = new ws(protocol + '://' + address)
    return new Promise((resolve, reject) => {

      this.ws.on('open', () => {
        resolve()
      })

      this.ws.on('message', async (msg:any) => {
        const data = JSON.parse(msg)
        if (typeof data !== 'object') {
          // We only accept JSON objects
          await this.errorDetected(WS2P_ERR.MESSAGE_MUST_BE_AN_OBJECT)
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
      })
    })
  }

  async request(body:WS2PRequest) {
    const uuid = nuuid.v4()
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
                }, REQUEST_TIMEOUT_VALUE)
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
import {Querable, querablep} from "../../../../../lib/common-libs/querable"
import {PeerDTO} from "../../../../../lib/dto/PeerDTO"
import {Keypair} from "../../../../../lib/dto/ConfDTO"
import {RemoteSynchronizer} from "../RemoteSynchronizer"
import {IRemoteContacter} from "../IRemoteContacter"
import {BlockDTO} from "../../../../../lib/dto/BlockDTO"
import {newResolveTimeoutPromise} from "../../../../../lib/common-libs/timeout-promise"

export class P2pCandidate {

  private readonly apiPromise: Querable<any>
  private dlPromise: Querable<BlockDTO[]|null>
  private readonly responseTimes: number[] = []
  private api: IRemoteContacter|null|undefined
  private nbSuccess = 0
  private isExcluded: boolean
  private failures = 0
  private reserved = false

  constructor(
    public p: PeerDTO,
    private keypair: Keypair,
    private logger: any,
    private allowLocalSync: boolean,
  ) {
    this.apiPromise = this.initAPI()
    this.dlPromise = querablep(Promise.resolve(null))
  }

  addFailure() {
    this.failures++
    if (this.failures >= 5 && !this.isExcluded) {
      this.isExcluded = true
      this.logger.warn('Excluding node %s as it returned unchainable chunks %s times', this.hostName, this.failures)
    }
  }

  isReady() {
    return !this.reserved && this.apiPromise.isResolved() && this.dlPromise.isResolved() && this.api && !this.isExcluded
  }

  async waitAvailability(maxWait: number): Promise<boolean> {
    return Promise.race([
      // Wait for availablity
      (async () => !this.isExcluded
        && (this.apiPromise.isRejected() ? await newResolveTimeoutPromise(maxWait, false) : !!(await this.apiPromise))
        && (this.dlPromise.isRejected() ? await newResolveTimeoutPromise(maxWait, false) : !!(await this.dlPromise)))(),
      // Maximum wait trigger
      newResolveTimeoutPromise(maxWait, false)
    ])
  }

  hasAvailableApi() {
    return !!this.api
  }

  avgResponseTime() {
    return this.responseTimes.reduce((sum, rt) => sum + rt, 0) / this.responseTimes.length
  }

  get hostName() {
    return (this.api && this.api.hostName) || 'NO_API'
  }

  async downloadBlocks(count: number, from: number) {
    const start = Date.now()
    let error: Error|undefined
    this.reserved = false
    this.dlPromise = querablep((async () => {
      // We try to download the blocks
      let blocks: BlockDTO[]|null
      try {
        blocks = await (this.api as IRemoteContacter).getBlocks(count, from)
      }
      catch (e) {
        // Unfortunately this can fail
        blocks = null
        error = e
      }
      this.responseTimes.push(Date.now() - start);
      // Only keep a flow of 5 ttas for the node
      if (this.responseTimes.length > 5) this.responseTimes.shift()
      this.nbSuccess++
      if (error) {
        throw error
      }
      return blocks
    })())
    return this.dlPromise
  }

  private getRemoteAPIs() {
    const bmaAPI = this.p.getBMA()
    const ws2pAPI = this.p.getFirstNonTorWS2P()
    const apis: RemoteAPI[] = []
    const bmaHost = bmaAPI.dns || bmaAPI.ipv4 || bmaAPI.ipv6
    if (bmaAPI.port && bmaHost) {
      apis.push({
        isBMA: true,
        port: bmaAPI.port,
        host: bmaHost
      })
    }
    if (ws2pAPI) {
      apis.push({
        isWS2P: true,
        host: ws2pAPI.host,
        port: ws2pAPI.port,
        path: ws2pAPI.path,
      })
    }
    return apis
  }

  private initAPI() {
    return querablep((async (): Promise<IRemoteContacter|null> => {
      try {
        const apis = this.getRemoteAPIs()
        const syncApi = await RemoteSynchronizer.getSyncAPI(apis, this.keypair)
        if (!this.allowLocalSync && ((syncApi && syncApi.api.hostName || '').match(/^(localhost|192|127)/))) {
          return null
        }
        this.api = syncApi.api
        return syncApi.api
      } catch (e) {
        return null
      }
    })())
  }

  reserve() {
    this.reserved = true
  }

  get apiName() {
    return this.api && this.api.type
  }
}

interface RemoteAPI {
  isBMA?: boolean
  isWS2P?: boolean
  host: string
  port: number
  path?: string
}
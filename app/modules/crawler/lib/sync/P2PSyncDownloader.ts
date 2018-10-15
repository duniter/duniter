import {JSONDBPeer} from "../../../../lib/db/DBPeer"
import {PeerDTO} from "../../../../lib/dto/PeerDTO"
import {Underscore} from "../../../../lib/common-libs/underscore"
import {BlockDTO} from "../../../../lib/dto/BlockDTO"
import {Watcher} from "./Watcher"
import {ISyncDownloader} from "./ISyncDownloader"
import {cliprogram} from "../../../../lib/common-libs/programOptions"
import {RemoteSynchronizer} from "./RemoteSynchronizer";
import {Keypair} from "../../../../lib/dto/ConfDTO";
import {IRemoteContacter} from "./IRemoteContacter";
import {Querable} from "../../../../lib/common-libs/querable";
import {cat} from "shelljs";
import {ManualPromise, newManualPromise} from "../../../../lib/common-libs/manual-promise"
import {GlobalFifoPromise} from "../../../../service/GlobalFifoPromise"
import {getNanosecondsTime} from "../../../../ProcessCpuProfiler"
import {CommonConstants} from "../../../../lib/common-libs/constants"
import {DataErrors} from "../../../../lib/common-libs/errors"
import {newRejectTimeoutPromise} from "../../../../lib/common-libs/timeout-promise"
import {ASyncDownloader} from "./ASyncDownloader"

const makeQuerablePromise = require('querablep');

export class P2PSyncDownloader extends ASyncDownloader implements ISyncDownloader {

  private PARALLEL_PER_CHUNK = 1;
  private MAX_DELAY_PER_DOWNLOAD = cliprogram.slow ? 15000 : 5000;
  private TOO_LONG_TIME_DOWNLOAD:string
  private nbBlocksToDownload:number
  private numberOfChunksToDownload:number
  private processing:any
  private handler:any
  private nodes: Querable<ProfiledNode>[] = []
  private nbDownloadsTried = 0
  private nbDownloading = 0
  private downloads: { [chunk: number]: ProfiledNode } = {}
  private fifoPromise = new GlobalFifoPromise()
  private nbWaitFailed = 0

  constructor(
    private currency: string,
    private keypair: Keypair,
    private localNumber:number,
    private to:number,
    private peers:JSONDBPeer[],
    private watcher:Watcher,
    private logger:any,
    public chunkSize: number,
    ) {
    super(chunkSize)
    this.TOO_LONG_TIME_DOWNLOAD = "No answer after " + this.MAX_DELAY_PER_DOWNLOAD + "ms, will retry download later.";
    this.nbBlocksToDownload = Math.max(0, to - localNumber);
    this.numberOfChunksToDownload = Math.ceil(this.nbBlocksToDownload / this.chunkSize);
    this.processing      = Array.from({ length: this.numberOfChunksToDownload }).map(() => false);
    this.handler         = Array.from({ length: this.numberOfChunksToDownload }).map(() => null);

    for (const thePeer of peers) {
      // Create the node
      let p = PeerDTO.fromJSONObject(thePeer)
      this.nodes.push(makeQuerablePromise((async () => {
        const bmaAPI = p.getBMA()
        const ws2pAPI = p.getFirstNonTorWS2P()
        const apis: { isBMA?: boolean, isWS2P?: boolean, host: string, port: number, path?: string }[] = []
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
        let syncApi: any = null
        try {
          syncApi = await RemoteSynchronizer.getSyncAPI(apis, this.keypair)
          const manualp = newManualPromise<boolean>()
          manualp.resolve(true)
          const node: ProfiledNode = {
            api: syncApi.api,
            tta: 1,
            ttas: [],
            nbSuccess: 1,
            excluded: false,
            readyForDownload: manualp,
            hostName: syncApi && syncApi.api.hostName || '',
          }
          if (node.hostName.match(/^(localhost|192|127)/)) {
            node.tta = this.MAX_DELAY_PER_DOWNLOAD
          }
          return node
        } catch (e) {
          return newManualPromise() // Which never resolves, so this node won't be used
        }
      })()))
    }
  }

  get maxSlots(): number {
    return this.nodes.length
  }

  private async wait4AnAvailableNode(): Promise<any> {
    let promises: Promise<any>[] = this.nodes
    return await Promise.race(promises.concat(newRejectTimeoutPromise(CommonConstants.REJECT_WAIT_FOR_AVAILABLE_NODES_IN_SYNC_AFTER)
      .catch(() => {
        if (this.nbWaitFailed >= CommonConstants.REJECT_WAIT_FOR_AVAILABLE_NODES_IN_SYNC_MAX_FAILS) {
          this.logger.error("Impossible sync: no more compliant nodes to download from")
          process.exit(2)
        }
        else {
          throw Error(DataErrors[DataErrors.REJECT_WAIT_FOR_AVAILABLE_NODES_BUT_CONTINUE])
        }
      })))
  }

  /**
   * Get a list of P2P nodes to use for download.
   * If a node is not yet correctly initialized (we can test a node before considering it good for downloading), then
   * this method would not return it.
   */
  private async getP2Pcandidates(): Promise<ProfiledNode[]> {
    return this.fifoPromise.pushFIFOPromise('getP2Pcandidates_' + getNanosecondsTime(), async () => {
      // We wait to have at least 1 available node
      await this.wait4AnAvailableNode()
      // We filter on all the available nodes, since serveral can be ready at the same time
      const readyNodes:ProfiledNode[] = await Promise.all(this.nodes.filter(p => p.isResolved()))
      // We remove the nodes impossible to reach (timeout)
      let withGoodDelays = Underscore.filter(readyNodes, (c) => c.tta <= this.MAX_DELAY_PER_DOWNLOAD && !c.excluded && c.readyForDownload.isResolved())
      if (withGoodDelays.length === 0) {
        readyNodes.map(c => {
          if (c.tta >= this.MAX_DELAY_PER_DOWNLOAD) {
            c.tta = this.MAX_DELAY_PER_DOWNLOAD - 1
          }
        })
      }
      const parallelMax = Math.min(this.PARALLEL_PER_CHUNK, withGoodDelays.length)
      withGoodDelays = Underscore.sortBy(withGoodDelays, c => c.tta)
      withGoodDelays = withGoodDelays.slice(0, parallelMax)
      // We temporarily augment the tta to avoid asking several times to the same node in parallel
      withGoodDelays.forEach(c => {
        c.tta = this.MAX_DELAY_PER_DOWNLOAD
        c.readyForDownload = newManualPromise()
      })
      if (withGoodDelays.length === 0) {
        this.logger.warn('No node found to download this chunk.')
        throw Error(DataErrors[DataErrors.NO_NODE_FOUND_TO_DOWNLOAD_CHUNK])
      }
      return withGoodDelays
    })
  }

  /**
   * Download a chunk of blocks using P2P network through BMA API.
   * @param from The starting block to download
   * @param count The number of blocks to download.
   * @param chunkIndex The # of the chunk in local algorithm (logging purposes only)
   */
  private async p2pDownload(from:number, count:number, chunkIndex:number) {
    // if this chunk has already been downloaded before, we exclude its supplier node from the download list as it won't give correct answer now
    const lastSupplier = this.downloads[chunkIndex]
    if (lastSupplier) {
      lastSupplier.excluded = true
      this.logger.warn('Excluding node %s as it returns unchainable chunks', lastSupplier.hostName)
    }
    let candidates = await this.getP2Pcandidates();
    // Book the nodes
    return await this.raceOrCancelIfTimeout(this.MAX_DELAY_PER_DOWNLOAD, candidates.map(async (node:ProfiledNode) => {
      try {
        const start = Date.now();
        this.handler[chunkIndex] = node;
        this.nbDownloading++;
        this.watcher.writeStatus('Getting chunck #' + chunkIndex + '/' + (this.numberOfChunksToDownload - 1) + ' from ' + from + ' to ' + (from + count - 1) + ' on peer ' + node.hostName);
        let blocks = await node.api.getBlocks(count, from);
        node.ttas.push(Date.now() - start);
        // Only keep a flow of 5 ttas for the node
        if (node.ttas.length > 5) node.ttas.shift();
        // Average time to answer
        node.tta = Math.round(node.ttas.reduce((sum:number, tta:number) => sum + tta, 0) / node.ttas.length);
        this.watcher.writeStatus('GOT chunck #' + chunkIndex + '/' + (this.numberOfChunksToDownload - 1) + ' from ' + from + ' to ' + (from + count - 1) + ' on peer ' + node.hostName);
        if (this.PARALLEL_PER_CHUNK === 1) {
          // Only works if we have 1 concurrent peer per chunk
          this.downloads[chunkIndex] = node
        }
        node.nbSuccess++;
        this.nbDownloadsTried++;
        this.nbDownloading--;
        node.readyForDownload.resolve(true)

        return blocks;
      } catch (e) {
        this.nbDownloading--;
        node.readyForDownload.resolve(true)
        this.nbDownloadsTried++;
        node.ttas.push(this.MAX_DELAY_PER_DOWNLOAD + 1); // No more ask on this node
        // Average time to answer
        node.tta = Math.round(node.ttas.reduce((sum:number, tta:number) => sum + tta, 0) / node.ttas.length);
        throw e;
      }
    }))
  }

  /**
   * Function for downloading a chunk by its number.
   * @param index Number of the chunk.
   */
  private async downloadChunk(index:number): Promise<BlockDTO[]> {
    // The algorithm to download a chunk
    const from = this.localNumber + 1 + index * this.chunkSize;
    let count = this.chunkSize;
    if (index == this.numberOfChunksToDownload - 1) {
      count = this.nbBlocksToDownload % this.chunkSize || this.chunkSize;
    }
    try {
      return await this.p2pDownload(from, count, index) as BlockDTO[]
    } catch (e) {
      this.logger.error(e);
      await new Promise(res => setTimeout(res, 1000)) // Wait 1s before retrying
      return this.downloadChunk(index);
    }
  }

  /**
   * Utility function this starts a race between promises but cancels it if no answer is found before `timeout`
   * @param timeout
   * @param races
   * @returns {Promise}
   */
  private raceOrCancelIfTimeout(timeout:number, races:any[]) {
    return Promise.race([
      // Process the race, but cancel it if we don't get an anwser quickly enough
      new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(this.TOO_LONG_TIME_DOWNLOAD);
        }, timeout)
      })
    ].concat(races));
  };

  /**
   * PUBLIC API
   */

  /***
   * Promises a chunk to be downloaded and returned
   * @param index The number of the chunk to download & return
   */
  getChunk(index:number): Promise<BlockDTO[]> {
    return this.downloadChunk(index)
  }

  async getTimesToAnswer(): Promise<{ ttas: number[] }[]> {
    const nodes = await Promise.all(this.nodes.filter(p => p.isResolved()))
    return nodes.filter(n => n.ttas.length > 0)
  }
}

interface ProfiledNode {
  api: IRemoteContacter
  tta: number
  ttas: number[]
  nbSuccess: number
  hostName: string
  excluded: boolean
  readyForDownload: ManualPromise<boolean>
}

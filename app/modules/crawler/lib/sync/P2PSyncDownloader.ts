import {JSONDBPeer} from "../../../../lib/db/DBPeer"
import {PeerDTO} from "../../../../lib/dto/PeerDTO"
import {Underscore} from "../../../../lib/common-libs/underscore"
import {BlockDTO} from "../../../../lib/dto/BlockDTO"
import {Watcher} from "./Watcher"
import {ISyncDownloader} from "./ISyncDownloader"
import {cliprogram} from "../../../../lib/common-libs/programOptions"
import {Keypair} from "../../../../lib/dto/ConfDTO"
import {IRemoteContacter} from "./IRemoteContacter"
import {ManualPromise} from "../../../../lib/common-libs/manual-promise"
import {GlobalFifoPromise} from "../../../../service/GlobalFifoPromise"
import {getNanosecondsTime} from "../../../../ProcessCpuProfiler"
import {CommonConstants} from "../../../../lib/common-libs/constants"
import {DataErrors} from "../../../../lib/common-libs/errors"
import {ASyncDownloader} from "./ASyncDownloader"
import {P2pCandidate} from "./p2p/p2p-candidate"

export class P2PSyncDownloader extends ASyncDownloader implements ISyncDownloader {

  private PARALLEL_PER_CHUNK = 1;
  private MAX_DELAY_PER_DOWNLOAD = cliprogram.slow ? 2 * 60000 : 15000;
  private TOO_LONG_TIME_DOWNLOAD:string
  private nbBlocksToDownload:number
  private numberOfChunksToDownload:number
  private processing:any
  private handler:any
  private p2pCandidates: P2pCandidate[] = []
  private nbDownloadsTried = 0
  private nbDownloading = 0
  private downloads: { [chunk: number]: P2pCandidate } = {}
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
    public allowLocalSync: boolean,
    ) {
    super(chunkSize)
    this.TOO_LONG_TIME_DOWNLOAD = "No answer after " + this.MAX_DELAY_PER_DOWNLOAD + "ms, will retry download later.";
    this.nbBlocksToDownload = Math.max(0, to - localNumber);
    this.numberOfChunksToDownload = Math.ceil(this.nbBlocksToDownload / this.chunkSize);
    this.processing      = Array.from({ length: this.numberOfChunksToDownload }).map(() => false);
    this.handler         = Array.from({ length: this.numberOfChunksToDownload }).map(() => null);

    this.p2pCandidates = peers.map(p => new P2pCandidate(PeerDTO.fromJSONObject(p), this.keypair, this.logger, allowLocalSync))
  }

  get maxSlots(): number {
    return this.p2pCandidates.filter(p => p.hasAvailableApi()).length
  }

  private async waitForAvailableNodesAndReserve(needed = 1): Promise<P2pCandidate[]> {
    this.watcher.beforeReadyNodes(this.p2pCandidates)
    let nodesToWaitFor = this.p2pCandidates.slice()
    let nodesAvailable: P2pCandidate[] = []
    let i = 0
    while (nodesAvailable.length < needed && i < needed) {
      await Promise.race(nodesToWaitFor.map(p => p.waitAvailability(CommonConstants.WAIT_P2P_CANDIDATE_HEARTBEAT)))
      const readyNodes = nodesToWaitFor.filter(p => p.isReady())
      nodesToWaitFor = nodesToWaitFor.filter(p => !p.isReady())
      nodesAvailable = nodesAvailable.concat(readyNodes)
      i++
    }
    return nodesAvailable.slice(0, needed).map(n => {
      n.reserve()
      return n
    })
  }

  /**
   * Get a list of P2P nodes to use for download.
   * If a node is not yet correctly initialized (we can test a node before considering it good for downloading), then
   * this method would not return it.
   */
  private async getP2Pcandidates(chunkIndex: number): Promise<P2pCandidate[]> {
    return this.fifoPromise.pushFIFOPromise('getP2Pcandidates_' + getNanosecondsTime(), async () => {
      // We wait a bit to have some available nodes
      const readyNodes = await this.waitForAvailableNodesAndReserve()
      // We remove the nodes impossible to reach (timeout)
      let byAvgAnswerTime = Underscore.sortBy(readyNodes, p => p.avgResponseTime())
      const parallelMax = Math.min(this.PARALLEL_PER_CHUNK, byAvgAnswerTime.length)
      byAvgAnswerTime = byAvgAnswerTime.slice(0, parallelMax)
      if (byAvgAnswerTime.length === 0) {
        this.logger.warn('No node found to download chunk #%s.', chunkIndex)
        this.watcher.unableToDownloadChunk(chunkIndex)
        throw Error(DataErrors[DataErrors.NO_NODE_FOUND_TO_DOWNLOAD_CHUNK])
      }
      return byAvgAnswerTime
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
      this.watcher.addWrongChunkFailure(chunkIndex, lastSupplier)
      lastSupplier.addFailure()
    }
    this.watcher.wantToDownload(chunkIndex)
    // Only 1 candidate for now
    const candidates = await this.getP2Pcandidates(chunkIndex)
    // Book the nodes
    this.watcher.gettingChunk(chunkIndex, candidates)
    return await this.raceOrCancelIfTimeout(this.MAX_DELAY_PER_DOWNLOAD, candidates.map(async (node) => {
      try {
        this.handler[chunkIndex] = node;
        this.nbDownloading++;
        this.watcher.writeStatus('Getting chunck #' + chunkIndex + '/' + (this.numberOfChunksToDownload - 1) + ' from ' + from + ' to ' + (from + count - 1) + ' on peer ' + node.hostName);
        let blocks = await node.downloadBlocks(count, from);
        this.watcher.gotChunk(chunkIndex, node)
        this.watcher.writeStatus('GOT chunck #' + chunkIndex + '/' + (this.numberOfChunksToDownload - 1) + ' from ' + from + ' to ' + (from + count - 1) + ' on peer ' + node.hostName);
        if (this.PARALLEL_PER_CHUNK === 1) {
          // Only works if we have 1 concurrent peer per chunk
          this.downloads[chunkIndex] = node
        }
        this.nbDownloading--;
        this.nbDownloadsTried++;
        return blocks;
      } catch (e) {
        this.watcher.failToGetChunk(chunkIndex, node)
        this.nbDownloading--;
        this.nbDownloadsTried++;
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

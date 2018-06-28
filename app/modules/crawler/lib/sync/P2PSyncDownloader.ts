import {JSONDBPeer} from "../../../../lib/db/DBPeer"
import {PeerDTO} from "../../../../lib/dto/PeerDTO"
import {connect} from "../connect"
import {Underscore} from "../../../../lib/common-libs/underscore"
import {BlockDTO} from "../../../../lib/dto/BlockDTO"
import {Watcher} from "./Watcher"
import {CommonConstants} from "../../../../lib/common-libs/constants"
import {ISyncDownloader} from "./ISyncDownloader"
import {cliprogram} from "../../../../lib/common-libs/programOptions"

const makeQuerablePromise = require('querablep');

export class P2PSyncDownloader implements ISyncDownloader {

  private PARALLEL_PER_CHUNK = 1;
  private MAX_DELAY_PER_DOWNLOAD = cliprogram.slow ? 15000 : 5000;
  private WAIT_DELAY_WHEN_MAX_DOWNLOAD_IS_REACHED = 3000;
  private NO_NODES_AVAILABLE = "No node available for download";
  private TOO_LONG_TIME_DOWNLOAD:string
  private nbBlocksToDownload:number
  private numberOfChunksToDownload:number
  private processing:any
  private handler:any
  private nodes:any = {}
  private nbDownloadsTried = 0
  private nbDownloading = 0
  private lastAvgDelay:number
  private downloads: { [chunk: number]: any } = {}

  constructor(
    private localNumber:number,
    private to:number,
    private peers:JSONDBPeer[],
    private watcher:Watcher,
    private logger:any,
    ) {

    this.TOO_LONG_TIME_DOWNLOAD = "No answer after " + this.MAX_DELAY_PER_DOWNLOAD + "ms, will retry download later.";
    this.nbBlocksToDownload = Math.max(0, to - localNumber);
    this.numberOfChunksToDownload = Math.ceil(this.nbBlocksToDownload / CommonConstants.CONST_BLOCKS_CHUNK);
    this.processing      = Array.from({ length: this.numberOfChunksToDownload }).map(() => false);
    this.handler         = Array.from({ length: this.numberOfChunksToDownload }).map(() => null);

    // Create slots of download, in a ready stage
    this.lastAvgDelay = this.MAX_DELAY_PER_DOWNLOAD;
  }

  /**
   * Get a list of P2P nodes to use for download.
   * If a node is not yet correctly initialized (we can test a node before considering it good for downloading), then
   * this method would not return it.
   */
  private async getP2Pcandidates(): Promise<any[]> {
    let promises = this.peers.reduce((chosens:any, other:any, index:number) => {
      if (!this.nodes[index]) {
        // Create the node
        let p = PeerDTO.fromJSONObject(this.peers[index]);
        this.nodes[index] = makeQuerablePromise((async () => {
          // We wait for the download process to be triggered
          // await downloadStarter;
          // if (nodes[index - 1]) {
          //   try { await nodes[index - 1]; } catch (e) {}
          // }
          const node:any = await connect(p)
          // We initialize nodes with the near worth possible notation
          node.tta = 1;
          node.nbSuccess = 0;
          if (node.host.match(/^(localhost|192|127)/)) {
            node.excluded = true
          }
          return node;
        })())
        chosens.push(this.nodes[index]);
      } else {
        chosens.push(this.nodes[index]);
      }
      // Continue
      return chosens;
    }, []);
    let candidates:any[] = await Promise.all(promises)
    candidates.forEach((c:any) => {
      c.tta = c.tta || 0; // By default we say a node is super slow to answer
      c.ttas = c.ttas || []; // Memorize the answer delays
    });
    if (candidates.length === 0) {
      throw this.NO_NODES_AVAILABLE;
    }
    // We remove the nodes impossible to reach (timeout)
    let withGoodDelays = Underscore.filter(candidates, (c:any) => c.tta <= this.MAX_DELAY_PER_DOWNLOAD && !c.excluded && !c.downloading);
    if (withGoodDelays.length === 0) {
      await new Promise(res => setTimeout(res, this.WAIT_DELAY_WHEN_MAX_DOWNLOAD_IS_REACHED)) // We wait a bit before continuing the downloads
      // We reinitialize the nodes
      this.nodes = {};
      // And try it all again
      return this.getP2Pcandidates();
    }
    const parallelMax = Math.min(this.PARALLEL_PER_CHUNK, withGoodDelays.length);
    withGoodDelays = Underscore.sortBy(withGoodDelays, (c:any) => c.tta);
    withGoodDelays = withGoodDelays.slice(0, parallelMax);
    // We temporarily augment the tta to avoid asking several times to the same node in parallel
    withGoodDelays.forEach((c:any) => c.tta = this.MAX_DELAY_PER_DOWNLOAD);
    return withGoodDelays;
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
      this.logger.warn('Excluding node %s as it returns unchainable chunks', [lastSupplier.host, lastSupplier.port].join(':'))
    }
    let candidates = await this.getP2Pcandidates();
    // Book the nodes
    return await this.raceOrCancelIfTimeout(this.MAX_DELAY_PER_DOWNLOAD, candidates.map(async (node:any) => {
      try {
        const start = Date.now();
        this.handler[chunkIndex] = node;
        node.downloading = true;
        this.nbDownloading++;
        this.watcher.writeStatus('Getting chunck #' + chunkIndex + '/' + (this.numberOfChunksToDownload - 1) + ' from ' + from + ' to ' + (from + count - 1) + ' on peer ' + [node.host, node.port].join(':'));
        let blocks = await node.getBlocks(count, from);
        node.ttas.push(Date.now() - start);
        // Only keep a flow of 5 ttas for the node
        if (node.ttas.length > 5) node.ttas.shift();
        // Average time to answer
        node.tta = Math.round(node.ttas.reduce((sum:number, tta:number) => sum + tta, 0) / node.ttas.length);
        this.watcher.writeStatus('GOT chunck #' + chunkIndex + '/' + (this.numberOfChunksToDownload - 1) + ' from ' + from + ' to ' + (from + count - 1) + ' on peer ' + [node.host, node.port].join(':'));
        if (this.PARALLEL_PER_CHUNK === 1) {
          // Only works if we have 1 concurrent peer per chunk
          this.downloads[chunkIndex] = node
        }
        node.nbSuccess++;

        const peers = await Promise.all(Underscore.values(this.nodes))
        const downloading = Underscore.filter(peers, (p:any) => p.downloading && p.ttas.length);
        this.lastAvgDelay = downloading.reduce((sum:number, c:any) => {
          const tta = Math.round(c.ttas.reduce((sum:number, tta:number) => sum + tta, 0) / c.ttas.length)
          return sum + tta
        }, 0) / downloading.length

        this.nbDownloadsTried++;
        this.nbDownloading--;
        node.downloading = false;

        return blocks;
      } catch (e) {
        this.nbDownloading--;
        node.downloading = false;
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
    const from = this.localNumber + 1 + index * CommonConstants.CONST_BLOCKS_CHUNK;
    let count = CommonConstants.CONST_BLOCKS_CHUNK;
    if (index == this.numberOfChunksToDownload - 1) {
      count = this.nbBlocksToDownload % CommonConstants.CONST_BLOCKS_CHUNK || CommonConstants.CONST_BLOCKS_CHUNK;
    }
    try {
      return await this.p2pDownload(from, count, index) as BlockDTO[]
    } catch (e) {
      this.logger.error(e);
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

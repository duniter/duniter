import {PromiseOfBlocksReading} from "../sync"
import {JSONDBPeer} from "../../../../lib/db/DBPeer"
import {FileDAL} from "../../../../lib/dal/fileDAL"
import {DBBlock} from "../../../../lib/db/DBBlock"
import {PeerDTO} from "../../../../lib/dto/PeerDTO"
import {connect} from "../connect"
import {Underscore} from "../../../../lib/common-libs/underscore"
import {BlockDTO} from "../../../../lib/dto/BlockDTO"
import {CrawlerConstants} from "../constants"
import {hashf} from "../../../../lib/common"
import {Watcher} from "./Watcher"
import {CommonConstants} from "../../../../lib/common-libs/constants"
import {getBlockInnerHashAndNonceWithSignature, getBlockInnerPart} from "../../../../lib/common-libs/rawer"
import {Querable} from "../../../../lib/common-libs/querable"

const makeQuerablePromise = require('querablep');

export class P2PDownloader {

  private PARALLEL_PER_CHUNK = 1;
  private MAX_DELAY_PER_DOWNLOAD = 5000;
  private WAIT_DELAY_WHEN_MAX_DOWNLOAD_IS_REACHED = 3000;
  private NO_NODES_AVAILABLE = "No node available for download";
  private TOO_LONG_TIME_DOWNLOAD:string
  private nbBlocksToDownload:number
  private numberOfChunksToDownload:number
  private downloadSlots:number
  private writtenChunks = 0
  private chunks: (PromiseOfBlocksReading|null)[]
  private processing:any
  private handler:any
  private resultsDeferers:any
  private resultsData:Promise<PromiseOfBlocksReading>[]
  private nodes:any = {}
  private nbDownloadsTried = 0
  private nbDownloading = 0
  private lastAvgDelay:number
  private aSlotWasAdded = false
  private slots:number[] = [];
  private downloads: { [k:number]: Querable<PromiseOfBlocksReading> } = {};
  private startResolver:any
  private downloadStarter:Promise<any>

  constructor(
    private currency:string,
    private localNumber:number,
    private to:number,
    private toHash:string,
    private peers:JSONDBPeer[],
    private watcher:Watcher,
    private logger:any,
    private hashf:any,
    private dal:FileDAL,
    private slowOption:any,
    private nocautious:boolean,
    private otherDAL?:FileDAL) {

    this.TOO_LONG_TIME_DOWNLOAD = "No answer after " + this.MAX_DELAY_PER_DOWNLOAD + "ms, will retry download later.";
    this.nbBlocksToDownload = Math.max(0, to - localNumber);
    this.numberOfChunksToDownload = Math.ceil(this.nbBlocksToDownload / CommonConstants.CONST_BLOCKS_CHUNK);
    this.chunks          = Array.from({ length: this.numberOfChunksToDownload }).map(() => null);
    this.processing      = Array.from({ length: this.numberOfChunksToDownload }).map(() => false);
    this.handler         = Array.from({ length: this.numberOfChunksToDownload }).map(() => null);
    this.resultsDeferers = Array.from({ length: this.numberOfChunksToDownload }).map(() => null);
    this.resultsData     = Array.from({ length: this.numberOfChunksToDownload }).map((unused, index) => new Promise((resolve, reject) => {
      this.resultsDeferers[index] = { resolve, reject };
    }));

    // Create slots of download, in a ready stage
    this.downloadSlots = slowOption ? 1 : Math.min(CommonConstants.INITIAL_DOWNLOAD_SLOTS, peers.length);
    this.lastAvgDelay = this.MAX_DELAY_PER_DOWNLOAD;

    /**
     * Triggers for starting the download.
     */
    this.downloadStarter = new Promise((resolve) => this.startResolver = resolve);

    /**
     * Download worker
     * @type {*|Promise} When finished.
     */
    (async () => {
      try {
        await this.downloadStarter;
        let doneCount = 0, resolvedCount = 0;
        while (resolvedCount < this.chunks.length) {
          doneCount = 0;
          resolvedCount = 0;
          // Add as much possible downloads as possible, and count the already done ones
          for (let i = this.chunks.length - 1; i >= 0; i--) {
            if (this.chunks[i] === null && !this.processing[i] && this.slots.indexOf(i) === -1 && this.slots.length < this.downloadSlots) {
              this.slots.push(i);
              this.processing[i] = true;
              this.downloads[i] = makeQuerablePromise(this.downloadChunk(i)); // Starts a new download
            } else if (this.downloads[i] && this.downloads[i].isFulfilled() && this.processing[i]) {
              doneCount++;
            }
            // We count the number of perfectly downloaded & validated chunks
            if (this.chunks[i]) {
              resolvedCount++;
            }
          }
          watcher.downloadPercent(Math.round(doneCount / this.numberOfChunksToDownload * 100));
          let races = this.slots.map((i) => this.downloads[i]);
          if (races.length) {
            try {
              await this.raceOrCancelIfTimeout(this.MAX_DELAY_PER_DOWNLOAD, races);
            } catch (e) {
              this.logger.warn(e);
            }
            for (let i = 0; i < this.slots.length; i++) {
              // We must know the index of what resolved/rejected to free the slot
              const doneIndex = this.slots.reduce((found:any, realIndex:number, index:number) => {
                if (found !== null) return found;
                if (this.downloads[realIndex].isFulfilled()) return index;
                return null;
              }, null);
              if (doneIndex !== null) {
                const realIndex = this.slots[doneIndex];
                if (this.downloads[realIndex].isResolved()) {
                  // IIFE to be safe about `realIndex`
                  (async () => {
                    const promiseOfBlocks = await this.downloads[realIndex]
                    const blocks = await promiseOfBlocks()
                    if (realIndex < this.chunks.length - 1) {
                      // We must wait for NEXT blocks to be STRONGLY validated before going any further, otherwise we
                      // could be on the wrong chain
                      await this.getChunk(realIndex + 1);
                    }
                    const chainsWell = await this.chainsCorrectly(blocks, realIndex);
                    if (chainsWell) {
                      // Chunk is COMPLETE
                      this.logger.warn("Chunk #%s is COMPLETE from %s", realIndex, [this.handler[realIndex].host, this.handler[realIndex].port].join(':'));
                      this.chunks[realIndex] = promiseOfBlocks
                      // We pre-save blocks only for non-cautious sync
                      if (this.nocautious) {
                        await this.dal.blockchainArchiveDAL.archive(blocks.map((b:any) => {
                          const block = DBBlock.fromBlockDTO(b)
                          block.fork = false
                          return block
                        }))
                        this.writtenChunks++
                        watcher.savedPercent(Math.round(this.writtenChunks / this.numberOfChunksToDownload * 100));
                      }
                      this.resultsDeferers[realIndex].resolve(this.chunks[realIndex]);
                    } else {
                      this.logger.warn("Chunk #%s DOES NOT CHAIN CORRECTLY from %s", realIndex, [this.handler[realIndex].host, this.handler[realIndex].port].join(':'));
                      // Penality on this node to avoid its usage
                      if (this.handler[realIndex].resetFunction) {
                        await this.handler[realIndex].resetFunction();
                      }
                      if (this.handler[realIndex].tta !== undefined) {
                        this.handler[realIndex].tta += this.MAX_DELAY_PER_DOWNLOAD;
                      }
                      // Need a retry
                      this.processing[realIndex] = false;
                    }
                  })()
                } else {
                  this.processing[realIndex] = false; // Need a retry
                }
                this.slots.splice(doneIndex, 1);
              }
            }
          }
          // Wait a bit
          await new Promise((resolve, reject) => setTimeout(resolve, 1));
        }
      } catch (e) {
        this.logger.error('Fatal error in the downloader:');
        this.logger.error(e);
      }
    })()
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
    let withGoodDelays = Underscore.filter(candidates, (c:any) => c.tta <= this.MAX_DELAY_PER_DOWNLOAD);
    if (withGoodDelays.length === 0) {
      await new Promise(res => setTimeout(res, this.WAIT_DELAY_WHEN_MAX_DOWNLOAD_IS_REACHED)) // We wait a bit before continuing the downloads
      // No node can be reached, we can try to lower the number of nodes on which we download
      this.downloadSlots = Math.floor(this.downloadSlots / 2);
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
        node.nbSuccess++;

        // Opening/Closing slots depending on the Interne connection
        if (this.slots.length == this.downloadSlots) {
          const peers = await Promise.all(Underscore.values(this.nodes))
          const downloading = Underscore.filter(peers, (p:any) => p.downloading && p.ttas.length);
          const currentAvgDelay = downloading.reduce((sum:number, c:any) => {
            const tta = Math.round(c.ttas.reduce((sum:number, tta:number) => sum + tta, 0) / c.ttas.length);
            return sum + tta;
          }, 0) / downloading.length;
          // Opens or close downloading slots
          if (!this.slowOption) {
            // Check the impact of an added node (not first time)
            if (!this.aSlotWasAdded) {
              // We try to add a node
              const newValue = Math.min(peers.length, this.downloadSlots + 1);
              if (newValue !== this.downloadSlots) {
                this.downloadSlots = newValue;
                this.aSlotWasAdded = true;
                this.logger.info('AUGMENTED DOWNLOAD SLOTS! Now has %s slots', this.downloadSlots);
              }
            } else {
              this.aSlotWasAdded = false;
              const decelerationPercent = currentAvgDelay / this.lastAvgDelay - 1;
              const addedNodePercent = 1 / this.nbDownloading;
              this.logger.info('Deceleration = %s (%s/%s), AddedNodePercent = %s', decelerationPercent, currentAvgDelay, this.lastAvgDelay, addedNodePercent);
              if (decelerationPercent > addedNodePercent) {
                this.downloadSlots = Math.max(1, this.downloadSlots - 1); // We reduce the number of slots, but we keep at least 1 slot
                this.logger.info('REDUCED DOWNLOAD SLOT! Now has %s slots', this.downloadSlots);
              }
            }
          }
          this.lastAvgDelay = currentAvgDelay;
        }

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
  private async downloadChunk(index:number): Promise<() => Promise<BlockDTO[]>> {
    // The algorithm to download a chunk
    const from = this.localNumber + 1 + index * CommonConstants.CONST_BLOCKS_CHUNK;
    let count = CommonConstants.CONST_BLOCKS_CHUNK;
    if (index == this.numberOfChunksToDownload - 1) {
      count = this.nbBlocksToDownload % CommonConstants.CONST_BLOCKS_CHUNK || CommonConstants.CONST_BLOCKS_CHUNK;
    }
    try {
      const fileName = this.currency + "/chunk_" + index + "-" + CommonConstants.CONST_BLOCKS_CHUNK + ".json";
      let existsOnDAL = await this.dal.confDAL.coreFS.exists(fileName)
      let existsOnOtherDAL = this.otherDAL && await this.otherDAL.confDAL.coreFS.exists(fileName)
      if (this.localNumber <= 0 && (existsOnDAL || existsOnOtherDAL)) {
        this.handler[index] = {
          host: 'filesystem',
          port: 'blockchain',
          resetFunction: () => this.dal.confDAL.coreFS.remove(fileName)
        };
        let theDAL:FileDAL = this.dal
        if (!existsOnDAL) {
          theDAL = this.otherDAL as FileDAL
        }
        // Returns a promise of file content
        return async () => {
          return (await theDAL.confDAL.coreFS.readJSON(fileName)).blocks
        }
      } else {
        const chunk:BlockDTO[] = await this.p2pDownload(from, count, index) as BlockDTO[]
        // Store the file to avoid re-downloading
        if (this.localNumber <= 0 && chunk.length === CommonConstants.CONST_BLOCKS_CHUNK) {
          await this.dal.confDAL.coreFS.makeTree(this.currency);
          await this.dal.confDAL.coreFS.writeJSON(fileName, { blocks: chunk.map((b:any) => DBBlock.fromBlockDTO(b)) });
          // Returns a promise of file content
          return async () => {
            const json = await this.dal.confDAL.coreFS.readJSON(fileName)
            return json.blocks
          }
        }
        // Returns a promise of file content
        return async () => {
          return chunk
        }
      }
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

  private async chainsCorrectly(blocks:BlockDTO[], index:number) {

    if (!blocks.length) {
      this.logger.error('No block was downloaded');
      return false;
    }

    for (let i = blocks.length - 1; i > 0; i--) {
      if (blocks[i].number !== blocks[i - 1].number + 1 || blocks[i].previousHash !== blocks[i - 1].hash) {
        this.logger.error("Blocks do not chaing correctly", blocks[i].number);
        return false;
      }
      if (blocks[i].version != blocks[i - 1].version && blocks[i].version != blocks[i - 1].version + 1) {
        this.logger.error("Version cannot be downgraded", blocks[i].number);
        return false;
      }
    }

    // Check hashes
    for (let i = 0; i < blocks.length; i++) {
      // Note: the hash, in Duniter, is made only on the **signing part** of the block: InnerHash + Nonce
      if (blocks[i].version >= 6) {
        for (const tx of blocks[i].transactions) {
          tx.version = CrawlerConstants.TRANSACTION_VERSION;
        }
      }
      if (blocks[i].inner_hash !== hashf(getBlockInnerPart(blocks[i])).toUpperCase()) {
        this.logger.error("Inner hash of block#%s from %s does not match", blocks[i].number);
        return false;
      }
      if (blocks[i].hash !== hashf(getBlockInnerHashAndNonceWithSignature(blocks[i])).toUpperCase()) {
        this.logger.error("Hash of block#%s from %s does not match", blocks[i].number);
        return false;
      }
    }

    const lastBlockOfChunk = blocks[blocks.length - 1];
    if ((lastBlockOfChunk.number == this.to || blocks.length < CommonConstants.CONST_BLOCKS_CHUNK) && lastBlockOfChunk.hash != this.toHash) {
      // Top chunk
      this.logger.error('Top block is not on the right chain');
      return false;
    } else {
      // Chaining between downloads
      const previousChunk = await this.getChunk(index + 1);
      const blockN = blocks[blocks.length - 1]; // The block n
      const blockNp1 = (await previousChunk())[0] // The block n + 1
      if (blockN && blockNp1 && (blockN.number + 1 !== blockNp1.number || blockN.hash != blockNp1.previousHash)) {
        this.logger.error('Chunk is not referenced by the upper one');
        return false;
      }
    }
    return true;
  }

  /**
   * PUBLIC API
   */

  /***
   * Triggers the downloading
   */
  start() {
    return this.startResolver()
  }

  /***
   * Promises a chunk to be downloaded and returned
   * @param index The number of the chunk to download & return
   */
  getChunk(index:number): Promise<PromiseOfBlocksReading> {
    return this.resultsData[index] || Promise.resolve(async () => [] as BlockDTO[])
  }
}

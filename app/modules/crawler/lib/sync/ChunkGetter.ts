import {PromiseOfBlocksReading} from "./PromiseOfBlockReading"
import {BlockDTO} from "../../../../lib/dto/BlockDTO"
import {CrawlerConstants} from "../constants"
import {hashf} from "../../../../lib/common"
import {getBlockInnerHashAndNonceWithSignature, getBlockInnerPart} from "../../../../lib/common-libs/rawer"
import {CommonConstants} from "../../../../lib/common-libs/constants"
import {NewLogger} from "../../../../lib/logger"
import {ISyncDownloader} from "./ISyncDownloader"
import {DBBlock} from "../../../../lib/db/DBBlock"
import {FileDAL} from "../../../../lib/dal/fileDAL"
import {Watcher} from "./Watcher"
import {cliprogram} from "../../../../lib/common-libs/programOptions"
import {P2PSyncDownloader} from "./P2PSyncDownloader"
import {JSONDBPeer} from "../../../../lib/db/DBPeer"
import {FsSyncDownloader} from "./FsSyncDownloader"
import {Querable, querablep} from "../../../../lib/common-libs/querable"

const logger = NewLogger()

interface DownloadHandler {
  downloader: ISyncDownloader
}

interface WaitingState extends DownloadHandler {
  state: 'WAITING',
  chunk?: Querable<BlockDTO[]>,
}

interface DownloadingState extends DownloadHandler {
  state: 'DOWNLOADING',
  chunk: Querable<BlockDTO[]>,
}

interface DownloadedState extends DownloadHandler {
  state: 'DOWNLOADED',
  chunk: Querable<BlockDTO[]>,
}

interface CompletedState extends DownloadHandler {
  state: 'COMPLETED',
  readBlocks: PromiseOfBlocksReading,
}

export class ChunkGetter {

  private resultsDeferers:{ resolve: (data: PromiseOfBlocksReading) => void, reject: () => void }[]
  private resultsData:Promise<PromiseOfBlocksReading>[]
  private downloadHandlers:(WaitingState|DownloadingState|DownloadedState|CompletedState)[]
  private fsDownloader: ISyncDownloader
  private p2PDownloader: ISyncDownloader
  private downloadedChunks = 0
  private writtenChunks = 0
  private numberOfChunksToDownload:number
  private parallelDownloads = cliprogram.slow ? 1 : 5
  private maxDownloadAdvance = 10 // 10 chunks can be downloaded even if 10th chunk above is not completed
  private MAX_DOWNLOAD_TIMEOUT = 15000
  private readDAL: FileDAL
  private writeDAL: FileDAL

  constructor(
    private currency:string,
    private localNumber:number,
    private to:number,
    private toHash:string,
    private peers:JSONDBPeer[],
    dal:FileDAL,
    private nocautious:boolean,
    private watcher:Watcher,
    otherDAL?:FileDAL,
  ) {
    this.readDAL = otherDAL || dal
    this.writeDAL = dal
    const nbBlocksToDownload = Math.max(0, to - localNumber)
    this.numberOfChunksToDownload = Math.ceil(nbBlocksToDownload / CommonConstants.CONST_BLOCKS_CHUNK)
    this.p2PDownloader = new P2PSyncDownloader(localNumber, to, peers, this.watcher, logger)
    this.fsDownloader = new FsSyncDownloader(localNumber, to, this.readDAL, this.getChunkName.bind(this), this.getChunksDir.bind(this))

    this.resultsDeferers = Array.from({ length: this.numberOfChunksToDownload }).map(() => ({
      resolve: () => { throw Error('resolve should not be called here') },
      reject: () => { throw Error('reject should not be called here') },
    }))
    this.resultsData     = Array.from({ length: this.numberOfChunksToDownload }).map((unused, index) => new Promise(async (resolve, reject) => {
      this.resultsDeferers[index] = { resolve, reject }
    }))
  }

  /***
   * Triggers the downloading, and parallelize it.
   */
  start() {

    // Initializes the downloads queue
    this.downloadHandlers = []
    for (let i = 0; i < this.numberOfChunksToDownload; i++) {
      this.downloadHandlers.push({
        state: 'WAITING',
        downloader: this.fsDownloader,
      })
    }

    // Download loop
    (async () => {
      let downloadFinished = false
      while(!downloadFinished) {

        let usedSlots = 0
        let remainingDownloads = 0
        let firstNonCompleted = 0

        // Scan loop:
        for (let i = this.numberOfChunksToDownload - 1; i >= 0; i--) {

          let isTopChunk = i === this.resultsDeferers.length - 1
          const handler = this.downloadHandlers[i]
          if (handler.state !== 'COMPLETED' && firstNonCompleted === 0) {
            firstNonCompleted = i
          }
          if (handler.state === 'WAITING') {
            // We reached a new ready slot.
            // If there is no more available slot, just stop the scan loop:
            if (usedSlots === this.parallelDownloads || i < firstNonCompleted - this.maxDownloadAdvance) {
              remainingDownloads++
              break;
            }
            // Otherwise let's start a download
            if (isTopChunk) {
              // The top chunk is always downloaded via P2P
              handler.downloader = this.p2PDownloader
            }
            handler.chunk = querablep(handler.downloader.getChunk(i))
            ;(handler as any).state = 'DOWNLOADING'
            remainingDownloads++
            usedSlots++
          }
          else if (handler.state === 'DOWNLOADING') {
            if (handler.chunk.isResolved()) {
              (handler as any).state = 'DOWNLOADED'
              i++ // We loop back on this handler
            } else if (Date.now() - handler.chunk.startedOn > this.MAX_DOWNLOAD_TIMEOUT) {
              (handler as any).chunk = [];
              (handler as any).state = 'DOWNLOADED'
              i++ // We loop back on this handler
            } else {
              remainingDownloads++
              usedSlots++
            }
          }
          else if (handler.state === 'DOWNLOADED') {
            // Chaining test: we must wait for upper chunk to be completed (= downloaded + chained)
            const chunk = await handler.chunk
            if (chunk.length === 0 && handler.downloader === this.fsDownloader) {
              // Retry with P2P
              handler.downloader = this.p2PDownloader
              ;(handler as any).state = 'WAITING'
            }
            if (isTopChunk || this.downloadHandlers[i + 1].state === 'COMPLETED') {
              const fileName = this.getChunkName(i)
              let promiseOfUpperChunk: PromiseOfBlocksReading = async () => []
              if (!isTopChunk && chunk.length) {
                // We need to wait for upper chunk to be completed to be able to check blocks' correct chaining
                promiseOfUpperChunk = await this.resultsData[i + 1]
              }
              const chainsWell = await chainsCorrectly(chunk, promiseOfUpperChunk, this.to, this.toHash)
              if (!chainsWell) {
                if (handler.downloader === this.p2PDownloader) {
                  if (chunk.length === 0) {
                    logger.error('No block was downloaded')
                  }
                  logger.warn("Chunk #%s is DOES NOT CHAIN CORRECTLY. Retrying.", i)
                }
                handler.downloader = this.p2PDownloader // If ever the first call does not chains well, we try using P2P
                ;(handler as any).state = 'WAITING'
                i++
              } else if (handler.downloader !== this.fsDownloader) {
                // Store the file to avoid re-downloading
                if (this.localNumber <= 0 && chunk.length === CommonConstants.CONST_BLOCKS_CHUNK) {
                  await this.writeDAL.confDAL.coreFS.makeTree(this.currency);
                  await this.writeDAL.confDAL.coreFS.writeJSON(fileName, { blocks: chunk.map((b:any) => DBBlock.fromBlockDTO(b)) });
                }
              } else {
                logger.warn("Chunk #%s read from filesystem.", i)
              }

              if (chainsWell) {

                // Chunk is COMPLETE
                logger.warn("Chunk #%s is COMPLETE", i)
                ;(handler as any).state = 'COMPLETED'
                if (!isTopChunk) {
                  (handler as any).chunk = undefined
                }
                this.downloadedChunks++
                this.watcher.downloadPercent(parseInt((this.downloadedChunks / this.numberOfChunksToDownload * 100).toFixed(0)))
                // We pre-save blocks only for non-cautious sync
                if (this.nocautious) {
                  await this.writeDAL.blockchainArchiveDAL.archive(chunk.map(b => {
                    const block = DBBlock.fromBlockDTO(b)
                    block.fork = false
                    return block
                  }))
                  this.writtenChunks++
                  this.watcher.storagePercent(Math.round(this.writtenChunks / this.numberOfChunksToDownload * 100));
                } else {
                  this.watcher.storagePercent(parseInt((this.downloadedChunks / this.numberOfChunksToDownload * 100).toFixed(0)))
                }

                // Returns a promise of file content
                this.resultsDeferers[i].resolve(async () => {
                  if (isTopChunk) {
                    return await handler.chunk // don't return directly "chunk" as it would prevent the GC to collect it
                  }
                  return (await this.readDAL.confDAL.coreFS.readJSON(fileName)).blocks
                })
              }
            } else {
              remainingDownloads++
            }
          }
        }

        downloadFinished = remainingDownloads === 0

        // Wait for a download to be finished
        if (!downloadFinished) {
          const downloadsToWait = (this.downloadHandlers.filter(h => h.state === 'DOWNLOADING') as DownloadingState[])
            .map(h => h.chunk)
          if (downloadsToWait.length) {
            await Promise.race(downloadsToWait)
          }
        }
      }
    })()
  }

  async getChunk(i: number): Promise<PromiseOfBlocksReading> {
    return this.resultsData[i] || Promise.resolve(async (): Promise<BlockDTO[]> => [])
  }

  private getChunkName(i: number) {
    return this.getChunksDir() + "chunk_" + i + "-" + CommonConstants.CONST_BLOCKS_CHUNK + ".json"
  }

  private getChunksDir() {
    return this.currency + "/"
  }
}

export async function chainsCorrectly(blocks:BlockDTO[], readNextChunk: PromiseOfBlocksReading, topNumber: number, topHash: string) {

  if (!blocks.length) {
    return false
  }

  for (let i = blocks.length - 1; i > 0; i--) {
    if (blocks[i].number !== blocks[i - 1].number + 1 || blocks[i].previousHash !== blocks[i - 1].hash) {
      logger.error("Blocks do not chaing correctly", blocks[i].number);
      return false;
    }
    if (blocks[i].version != blocks[i - 1].version && blocks[i].version != blocks[i - 1].version + 1) {
      logger.error("Version cannot be downgraded", blocks[i].number);
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
      logger.error("Inner hash of block#%s from %s does not match", blocks[i].number)
      return false
    }
    if (blocks[i].hash !== hashf(getBlockInnerHashAndNonceWithSignature(blocks[i])).toUpperCase()) {
      logger.error("Hash of block#%s from %s does not match", blocks[i].number)
      return false
    }
  }

  const lastBlockOfChunk = blocks[blocks.length - 1];
  if ((lastBlockOfChunk.number === topNumber || blocks.length < CommonConstants.CONST_BLOCKS_CHUNK) && lastBlockOfChunk.hash != topHash) {
    // Top chunk
    logger.error('Top block is not on the right chain')
    return false
  } else {
    // Chaining between downloads
    const previousChunk = await readNextChunk()
    const blockN = blocks[blocks.length - 1] // The block n
    const blockNp1 = (await previousChunk)[0] // The block n + 1
    if (blockN && blockNp1 && (blockN.number + 1 !== blockNp1.number || blockN.hash != blockNp1.previousHash)) {
      logger.error('Chunk is not referenced by the upper one')
      return false
    }
  }
  return true
}

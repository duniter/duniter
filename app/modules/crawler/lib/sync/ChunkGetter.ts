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

const logger = NewLogger()

export class ChunkGetter {

  private resultsDeferers:{ resolve: (data: PromiseOfBlocksReading) => void, reject: () => void }[]
  private resultsData:Promise<PromiseOfBlocksReading>[]
  private downloadStarter:Promise<void>
  private startResolver:() => void
  private fsDownloader: ISyncDownloader
  private p2PDownloader: ISyncDownloader
  private downloadedChunks = 0
  private writtenChunks = 0
  private numberOfChunksToDownload:number

  constructor(
    private currency:string,
    private localNumber:number,
    private to:number,
    private toHash:string,
    private peers:JSONDBPeer[],
    private dal:FileDAL,
    private nocautious:boolean,
    private watcher:Watcher,
    private otherDAL?:FileDAL,
  ) {
    const nbBlocksToDownload = Math.max(0, to - localNumber)
    this.numberOfChunksToDownload = Math.ceil(nbBlocksToDownload / CommonConstants.CONST_BLOCKS_CHUNK)
    this.p2PDownloader = new P2PSyncDownloader(localNumber, to, peers, this.watcher, logger)
    this.fsDownloader = new FsSyncDownloader(localNumber, to, otherDAL || dal, this.getChunkName.bind(this), this.getChunksDir.bind(this))

    this.resultsDeferers = Array.from({ length: this.numberOfChunksToDownload }).map(() => ({
      resolve: () => { throw Error('resolve should not be called here') },
      reject: () => { throw Error('reject should not be called here') },
    }))
    this.resultsData     = Array.from({ length: this.numberOfChunksToDownload }).map((unused, index) => new Promise(async (resolve, reject) => {
      this.resultsDeferers[index] = { resolve, reject }
    }))

    if (cliprogram.slow) {
      // TODO: Handle slow option
    }

    /**
     * Triggers for starting the download.
     */
    this.downloadStarter = new Promise((resolve) => this.startResolver = resolve);

    this.resultsDeferers.map(async (deferer, i) => {
      let isTopChunk = i === this.resultsDeferers.length - 1
      let promiseOfUpperChunk: PromiseOfBlocksReading = async () => []
      if (!isTopChunk) {
        // We need to wait for upper chunk to be completed to be able to check blocks' correct chaining
        promiseOfUpperChunk = await this.resultsData[i + 1]
      }
      const fileName = this.getChunkName(i)

      let chunk: BlockDTO[] = []
      let chainsWell = false
      let downloader: ISyncDownloader = isTopChunk ? this.p2PDownloader : this.fsDownloader // We first try on FS only for non-top chunks
      do {
        chunk = await downloader.getChunk(i)
        chainsWell = await chainsCorrectly(chunk, promiseOfUpperChunk, this.to, this.toHash)
        if (!chainsWell) {
          if (downloader === this.p2PDownloader) {
            if (chunk.length === 0) {
              logger.error('No block was downloaded')
            }
            logger.warn("Chunk #%s is DOES NOT CHAIN CORRECTLY. Retrying.", i)
          }
          downloader = this.p2PDownloader // If ever the first call does not chains well, we try using P2P
        } else if (downloader !== this.fsDownloader) {
          // Store the file to avoid re-downloading
          if (this.localNumber <= 0 && chunk.length === CommonConstants.CONST_BLOCKS_CHUNK) {
            await this.dal.confDAL.coreFS.makeTree(this.currency);
            await this.dal.confDAL.coreFS.writeJSON(fileName, { blocks: chunk.map((b:any) => DBBlock.fromBlockDTO(b)) });
          }
        } else {
          logger.warn("Chunk #%s read from filesystem.", i)
        }
      }
      while (!chainsWell)
      // Chunk is COMPLETE
      logger.warn("Chunk #%s is COMPLETE", i)
      this.downloadedChunks++
      watcher.downloadPercent(parseInt((this.downloadedChunks / this.numberOfChunksToDownload * 100).toFixed(0)))
      // We pre-save blocks only for non-cautious sync
      if (this.nocautious) {
        await this.dal.blockchainArchiveDAL.archive(chunk.map(b => {
          const block = DBBlock.fromBlockDTO(b)
          block.fork = false
          return block
        }))
        this.writtenChunks++
        watcher.savedPercent(Math.round(this.writtenChunks / this.numberOfChunksToDownload * 100));
      }
      // Returns a promise of file content
      deferer.resolve(async () => {
        if (isTopChunk) {
          return chunk
        }
        return (await this.dal.confDAL.coreFS.readJSON(fileName)).blocks
      })
    })
  }

  /***
   * Triggers the downloading
   */
  start() {
    return this.startResolver()
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

import {Duplex} from 'stream'
import {FileDAL} from "../../../../../lib/dal/fileDAL"
import {AbstractSynchronizer} from "../AbstractSynchronizer"
import {Watcher} from "../Watcher"
import {ISyncDownloader} from "../ISyncDownloader"
import {BlockDTO} from "../../../../../lib/dto/BlockDTO"
import {Querable, querablep} from "../../../../../lib/common-libs/querable"
import {DBBlock} from "../../../../../lib/db/DBBlock"
import {ManualPromise, newManualPromise} from "../../../../../lib/common-libs/manual-promise"
import {NewLogger} from "../../../../../lib/logger"
import {getBlockInnerHashAndNonceWithSignature, getBlockInnerPart} from "../../../../../lib/common-libs/rawer"
import {PromiseOfBlocksReading} from "../PromiseOfBlockReading"
import {hashf} from "../../../../../lib/common"
import {CrawlerConstants} from "../../constants"

const logger = NewLogger()

export class DownloadStream extends Duplex {

  private fsDownloader: ISyncDownloader
  private p2PDownloader: ISyncDownloader
  private numberOfChunksToDownload:number
  private currentChunkNumber = 0
  private chunks: BlockDTO[][]
  private milestones: ManualPromise<BlockDTO>[]
  private dowloading: Querable<BlockDTO[]>[]
  private bestDownloaded = -1

  private writeDAL: FileDAL

  constructor(
    private localNumber:number,
    private to:number,
    private toHash:string,
    private syncStrategy: AbstractSynchronizer,
    dal:FileDAL,
    private nocautious:boolean,
    private watcher:Watcher,
  ) {
    super({objectMode: true})
    this.writeDAL = dal
    const nbBlocksToDownload = Math.max(0, to - localNumber)
    this.numberOfChunksToDownload = Math.ceil(nbBlocksToDownload / syncStrategy.chunkSize)
    this.p2PDownloader = syncStrategy.p2pDownloader()
    this.fsDownloader = syncStrategy.fsDownloader()

    this.chunks = Array.from({ length: this.numberOfChunksToDownload })
    this.dowloading = Array.from({ length: this.numberOfChunksToDownload })
    this.milestones = Array.from({ length: this.numberOfChunksToDownload }).map(() => newManualPromise())

    this.downloadChunk(0)
  }

  private async downloadChunk(i: number): Promise<BlockDTO[]> {
    if (i + 1 > this.numberOfChunksToDownload) {
      return Promise.resolve([])
    }
    if (!this.dowloading[i] && !this.chunks[i]) {
      this.dowloading[i] = querablep((async (): Promise<BlockDTO[]> => {
        const milestone = await this.milestones[i]
        let downloader: ISyncDownloader = this.fsDownloader // First, we try with saved file
        let chunk: BlockDTO[]
        // We don't have the file locally: we loop on P2P download until we have it (or until P2P throws a general error)
        do {
          this.watcher.wantToLoad(i)
          chunk = await downloader.getChunk(i)
          if (chunk.length) {
            // NewLogger().info("Chunk #%s is COMPLETE", i)
            const topIndex = Math.min(milestone.number % this.syncStrategy.chunkSize, chunk.length - 1)
            const topBlock = chunk[topIndex]
            if (topBlock.number !== milestone.number || topBlock.hash !== milestone.hash) {
              // This chunk is invalid, let's try another one
              chunk = []
            }
            if (i > 0) {
              const previous = await this.downloadChunk(i - 1)
              const chainsWell = await chainsCorrectly(previous, () => Promise.resolve(chunk), this.to, this.toHash, this.syncStrategy.chunkSize)
              if (!chainsWell) {
                NewLogger().warn("Chunk #%s DOES NOT CHAIN CORRECTLY. Retrying.", i)
                chunk = []
              }
            }
          }
          if (!chunk.length) {
            // Now we try using P2P
            downloader = this.p2PDownloader
          }
        } while (!chunk.length && i <= this.numberOfChunksToDownload)
        // NewLogger().info("Chunk #%s chains well.", i)
        const fileName = this.syncStrategy.getChunkRelativePath(i)
        let doWrite = downloader !== this.fsDownloader
          || !(await this.writeDAL.confDAL.coreFS.exists(fileName))
        if (doWrite) {
          // Store the file to avoid re-downloading
          if (this.localNumber <= 0 && chunk.length === this.syncStrategy.chunkSize) {
            await this.writeDAL.confDAL.coreFS.makeTree(this.syncStrategy.getCurrency())
            const content = { blocks: chunk.map((b:any) => DBBlock.fromBlockDTO(b)) }
            await this.writeDAL.confDAL.coreFS.writeJSON(fileName, content)
          }
        }
        if (i > this.bestDownloaded) {
          this.bestDownloaded = i
          this.watcher.downloadPercent(Math.round((i + 1) / this.numberOfChunksToDownload * 100))
        }
        await this.writeDAL.blockchainArchiveDAL.archive(chunk.map(b => {
          const block = DBBlock.fromBlockDTO(b)
          block.fork = false
          return block
        }))
        return chunk
      })())
      this.dowloading[i]
        .then(chunk => {
          this.chunks[i] = chunk
          delete this.dowloading[i]
        })
      return this.dowloading[i] || this.chunks[i]
    }
    return this.dowloading[i] || this.chunks[i]
  }

  _read(size: number) {
    if (this.currentChunkNumber == this.numberOfChunksToDownload) {
      this.push(null)
    } else {
      // Asks for next chunk: do we have it?
      if (this.chunks[this.currentChunkNumber]) {
        this.push(this.chunks[this.currentChunkNumber])
        delete this.chunks[this.currentChunkNumber]
        // Let's start the download of next chunk
        this.currentChunkNumber++
        let p = this.downloadChunk(this.currentChunkNumber)
        for (let i = 1; i <= CrawlerConstants.SYNC_CHUNKS_IN_ADVANCE; i++) {
          p = p.then(() => this.downloadChunk(this.currentChunkNumber + i))
        }
      }
      else {
        // We don't have it yet
        this.push(undefined)
      }
    }
  }

  _write(block: BlockDTO|undefined, encoding: any, callback: (err: any) => void) {
    if (block) {
      const i = Math.ceil(((block.number + 1) / this.syncStrategy.chunkSize) - 1)
      // console.log('Done validation of chunk #%s', i)
      this.milestones[i].resolve(block)
    }
    setTimeout(() => {
      callback(null)
    }, 1)
  }

}


export async function chainsCorrectly(blocks:BlockDTO[], readNextChunk: PromiseOfBlocksReading, topNumber: number, topHash: string, chunkSize: number) {

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
  if ((lastBlockOfChunk.number === topNumber || blocks.length < chunkSize) && lastBlockOfChunk.hash != topHash) {
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

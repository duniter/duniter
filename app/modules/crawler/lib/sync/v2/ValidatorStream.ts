import { Readable } from "stream";
import { AbstractSynchronizer } from "../AbstractSynchronizer";
import { BlockDTO } from "../../../../../lib/dto/BlockDTO";
import { Querable, querablep } from "../../../../../lib/common-libs/querable";
import { DataErrors } from "../../../../../lib/common-libs/errors";
import { NewLogger } from "../../../../../lib/logger";
import { ISyncDownloader } from "../ISyncDownloader";
import { Watcher } from "../Watcher";
import { ExitCodes } from "../../../../../lib/common-libs/exit-codes";

export class ValidatorStream extends Readable {
  private fsSynchronizer: ISyncDownloader;
  private numberOfChunksToDownload: number;
  private currentChunkNumber = 0;
  private chunks: BlockDTO[];
  private dowloading: Querable<BlockDTO>[];
  private cacheLevelValidationPromise: Promise<number>;
  private bestDownloaded = -1;

  constructor(
    private localNumber: number,
    private to: number,
    private toHash: string,
    private syncStrategy: AbstractSynchronizer,
    private watcher: Watcher
  ) {
    super({ objectMode: true });
    const nbBlocksToDownload = Math.max(0, to - localNumber);
    this.numberOfChunksToDownload = Math.ceil(
      nbBlocksToDownload / syncStrategy.chunkSize
    );

    this.chunks = Array.from({ length: this.numberOfChunksToDownload });
    this.dowloading = Array.from({ length: this.numberOfChunksToDownload });

    this.fsSynchronizer = syncStrategy.fsDownloader();

    this.downloadBlock(0);
  }

  private async downloadBlock(i: number, forceDownload = false) {
    const maximumCacheNumber = forceDownload
      ? -1
      : await this.validateCacheLevel();
    if (i + 1 > this.numberOfChunksToDownload) {
      return Promise.resolve();
    }
    if (!this.dowloading[i] && !this.chunks[i]) {
      this.dowloading[i] = querablep(
        (async (): Promise<BlockDTO> => {
          let failures = 0;
          let block: BlockDTO | null;
          do {
            try {
              const bNumber = Math.min(
                this.to,
                (i + 1) * this.syncStrategy.chunkSize - 1
              );
              if (bNumber > maximumCacheNumber) {
                block = await this.syncStrategy.getMilestone(bNumber);
              } else {
                block = await this.getBlockFromCache(bNumber);
              }
              if (!forceDownload && i > this.bestDownloaded) {
                this.watcher.storagePercent(
                  Math.round(((i + 1) / this.numberOfChunksToDownload) * 100)
                );
                this.bestDownloaded = i;
              }
              if (!block) {
                throw Error(
                  DataErrors[DataErrors.CANNOT_GET_VALIDATION_BLOCK_FROM_REMOTE]
                );
              }
            } catch (e) {
              failures++;
              await new Promise((res) => setTimeout(res, 3000));
              if (failures >= 15) {
                NewLogger().error(
                  "Could not get a validation from remote blockchain after %s trials. Stopping sync.",
                  failures
                );
                process.exit(ExitCodes.SYNC_FAIL);
              }
              block = null;
            }
          } while (!block);
          return block;
        })()
      );
      this.dowloading[i]
        .then((chunk) => {
          this.chunks[i] = chunk;
          delete this.dowloading[i];
          // this.push(chunk)
        })
        .catch((err) => {
          throw err;
        });
      return this.dowloading[i] || this.chunks[i];
    }
    return this.dowloading[i] || this.chunks[i];
  }

  private async getBlockFromCache(bNumber: number): Promise<BlockDTO | null> {
    return this.fsSynchronizer.getBlock(bNumber);
  }

  _read(size: number) {
    if (this.currentChunkNumber == this.numberOfChunksToDownload) {
      this.push(null);
    } else {
      // Asks for next chunk: do we have it?
      if (this.chunks[this.currentChunkNumber]) {
        this.push(this.chunks[this.currentChunkNumber]);
        delete this.chunks[this.currentChunkNumber];
        // Let's start the download of next chunk
        this.currentChunkNumber++;
        this.downloadBlock(this.currentChunkNumber)
          .then(() => this.downloadBlock(this.currentChunkNumber + 1))
          .then(() => this.downloadBlock(this.currentChunkNumber + 2))
          .then(() => this.downloadBlock(this.currentChunkNumber + 3))
          .then(() => this.downloadBlock(this.currentChunkNumber + 4))
          .then(() => this.downloadBlock(this.currentChunkNumber + 5))
          .then(() => this.downloadBlock(this.currentChunkNumber + 6));
      } else {
        // We don't have it yet
        this.push(undefined);
      }
    }
  }

  private async validateCacheLevel(): Promise<number> {
    if (!this.cacheLevelValidationPromise) {
      this.cacheLevelValidationPromise = (async (): Promise<number> => {
        // Find the best common chunk with remote
        let topChunk = this.numberOfChunksToDownload - 1; // We ignore the top chunk, which is special (most unlikely to be full)
        let botChunk = -1; // In the worst case, this is the good index
        let current;
        do {
          current =
            topChunk -
            ((topChunk - botChunk) % 2 == 0
              ? (topChunk - botChunk) / 2
              : (topChunk - botChunk + 1) / 2 - 1);
          if (current === 0) {
            // we have no compliant cache
            return -1;
          }
          const bNumber = current * this.syncStrategy.chunkSize - 1;
          const remoteBlock = await this.downloadBlock(current - 1, true);
          const localBlock = await this.fsSynchronizer.getBlock(bNumber);
          if (
            remoteBlock &&
            localBlock &&
            remoteBlock.hash === localBlock.hash
          ) {
            // Success! Let's look forward
            botChunk = current;
          } else {
            // Fail: let's look backward
            topChunk = current - 1;
          }
        } while (botChunk !== topChunk);
        // retur topChunk or botChunk, it is the same
        return topChunk === -1
          ? -1
          : topChunk * this.syncStrategy.chunkSize - 1;
      })();
    }
    return this.cacheLevelValidationPromise;
  }
}

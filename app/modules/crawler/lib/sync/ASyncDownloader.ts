import {ISyncDownloader} from "./ISyncDownloader"
import {BlockDTO} from "../../../../lib/dto/BlockDTO"

export abstract class ASyncDownloader implements ISyncDownloader {

  protected constructor(
    public chunkSize: number) {}

  async getBlock(number: number): Promise<BlockDTO|null> {
    const chunkNumber = parseInt(String(number / this.chunkSize))
    const position = number % this.chunkSize
    const chunk = await this.getChunk(chunkNumber)
    return chunk[position]
  }

  abstract maxSlots: number
  abstract getChunk(i: number): Promise<BlockDTO[]>
}

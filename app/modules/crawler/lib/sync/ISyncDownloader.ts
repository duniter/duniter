import {BlockDTO} from "../../../../lib/dto/BlockDTO"

export interface ISyncDownloader {
  getChunk(i: number): Promise<BlockDTO[]>
  getBlock(number: number): Promise<BlockDTO|null>
  maxSlots: number
  chunkSize: number
  getTimesToAnswer(): Promise<{ ttas: number[] }[]>
}

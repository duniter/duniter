import {BlockDTO} from "../../../../lib/dto/BlockDTO"

export interface ISyncDownloader {
  getChunk(i: number): Promise<BlockDTO[]>
  maxSlots: number
  getTimesToAnswer(): Promise<{ ttas: number[] }[]>
}

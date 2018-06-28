import {ISyncDownloader} from "./ISyncDownloader"
import {BlockDTO} from "../../../../lib/dto/BlockDTO"
import {FileDAL} from "../../../../lib/dal/fileDAL"
import * as path from 'path'

export class FsSyncDownloader implements ISyncDownloader {

  private ls: Promise<string[]>

  constructor(
    private localNumber:number,
    private to:number,
    private dal:FileDAL,
    private getChunkName:(i: number) => string,
    private getChunksDir:() => string,
    ) {
    this.ls = this.dal.confDAL.coreFS.list(getChunksDir())
  }

  async getChunk(i: number): Promise<BlockDTO[]> {
    const files = await this.ls
    const fileName = this.getChunkName(i)
    const basename = path.basename(fileName)
    let existsOnDAL = files.filter(f => f === basename).length === 1
    if (!existsOnDAL) {
      existsOnDAL = !!(await this.dal.confDAL.coreFS.exists(fileName))
    }
    if (this.localNumber <= 0 && existsOnDAL) {
      // Returns a promise of file content
      return (await this.dal.confDAL.coreFS.readJSON(fileName)).blocks
    }
    return []
  }
}

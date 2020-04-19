import { ISyncDownloader } from "./ISyncDownloader";
import { BlockDTO } from "../../../../lib/dto/BlockDTO";
import { FileSystem } from "../../../../lib/system/directory";
import * as path from "path";
import { CommonConstants } from "../../../../lib/common-libs/constants";
import { ASyncDownloader } from "./ASyncDownloader";

export class FsSyncDownloader extends ASyncDownloader
  implements ISyncDownloader {
  private ls: Promise<string[]>;
  private ttas: number[] = [];

  constructor(
    private fs: FileSystem,
    private basePath: string,
    private getChunkName: (i: number) => string,
    public chunkSize: number
  ) {
    super(chunkSize);
    this.ls = this.fs.fsList(basePath);
  }

  async getChunk(i: number): Promise<BlockDTO[]> {
    const start = Date.now();
    const files = await this.ls;
    const filepath = path.join(this.basePath, this.getChunkName(i));
    const basename = path.basename(filepath);
    let existsOnDAL = files.filter((f) => f === basename).length === 1;
    if (!existsOnDAL) {
      // We make another try in case the file was created after the initial `ls` test
      existsOnDAL = await this.fs.fsExists(filepath);
    }
    if (existsOnDAL) {
      const content: any = JSON.parse(await this.fs.fsReadFile(filepath));
      // Record the reading duration
      this.ttas.push(Date.now() - start);
      // Returns a promise of file content
      return content.blocks;
    }
    return [];
  }

  get maxSlots(): number {
    return CommonConstants.MAX_READING_SLOTS_FOR_FILE_SYNC;
  }
}

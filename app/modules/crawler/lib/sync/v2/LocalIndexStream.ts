import {Transform} from 'stream'
import {Indexer} from "../../../../../lib/indexer"
import {cliprogram} from "../../../../../lib/common-libs/programOptions"
import {BlockDTO} from "../../../../../lib/dto/BlockDTO"
import {CurrencyConfDTO} from "../../../../../lib/dto/ConfDTO"
import {ProtocolIndexesStream} from "./ProtocolIndexesStream"

export class LocalIndexStream extends Transform {

  private sync_currConf: CurrencyConfDTO;
  private currentChunkNumber = 0

  constructor() {
    super({ objectMode: true })
  }

  _transform(blocks: BlockDTO[]|undefined, encoding: any, callback: (err: any, data: ProtocolIndexesStream[]|undefined) => void) {

    (async (): Promise<any> => {

      if (!blocks) {
        return setTimeout(() => callback(null, undefined), 1)
      }

      const result: ProtocolIndexesStream[] = []

      for (const block of blocks) {

        // The new kind of object stored
        const dto = BlockDTO.fromJSONObject(block)

        if (block.number == 0) {
          this.sync_currConf = BlockDTO.getConf(block)
        }

        const index:any = Indexer.localIndex(dto, this.sync_currConf)

        result.push({
          block,
          iindex: Indexer.iindex(index),
          cindex: Indexer.cindex(index),
          sindex: cliprogram.noSources ? [] : Indexer.sindex(index),
          mindex: Indexer.mindex(index),
        })
      }

      this.currentChunkNumber++

      // Done for this chunk
      callback(null, result)
    })()
  }

}

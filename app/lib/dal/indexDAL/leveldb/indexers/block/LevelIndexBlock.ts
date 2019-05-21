import {LevelDBDataIndex} from "../../generic/LevelDBDataIndex"
import {DBBlock} from "../../../../../db/DBBlock"
import {DataErrors} from "../../../../../common-libs/errors"

export abstract class LevelIndexBlock extends LevelDBDataIndex<number[], DBBlock> {

  abstract matches(b: DBBlock): boolean

  abstract keys(b: DBBlock): string[]

  async onInsert(records: DBBlock[]): Promise<void> {
    const recordsByBlock = records
      .filter(this.matches)
      .map(b => ({
        keys: this.keys(b),
        b
      }))
    const map: { [k: string]: number[] } = {}
    recordsByBlock.forEach(m => {
      m.keys.forEach(k => {
        if (!map[k]) {
          map[k] = []
        }
        map[k].push(m.b.number)
      })
    })
    await Promise.all(
      Object.keys(map)
        .map(k => this.indexIt(k, map[k]))
    )
  }

  async onRemove(records: DBBlock[]): Promise<void> {
    await Promise.all(records
      .filter(this.matches)
      .map(async b =>
        Promise.all(
          this
            .keys(b)
            .map(i => this.unindexIt(i, b.number))
        )
      )
    )
  }

  private async indexIt(pub: string, newNumbers: number[]) {
    const blockNumbers = (await this.getOrNull(pub)) || []
    newNumbers.forEach(n => blockNumbers.push(n))
    await this.put(pub, blockNumbers)
  }

  private async unindexIt(pub: string, blockNumber: number) {
    const blockNumbers = (await this.getOrNull(pub))
    if (!blockNumbers) {
      throw DataErrors[DataErrors.DB_INCORRECT_INDEX]
    }
    const index = blockNumbers.indexOf(blockNumber)
    if (index === -1) {
      throw DataErrors[DataErrors.DB_INDEXED_BLOCK_NOT_FOUND]
    }
    blockNumbers.splice(index, 1)
    if (blockNumbers.length) {
      await this.put(pub, blockNumbers)
    } else {
      await this.del(pub)
    }
  }
}

export const LDBIndex_ALL = 'ALL'

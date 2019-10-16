import {LevelUp} from "levelup";
import {reduceConcat, reduceGroupBy} from "../../../../common-libs/reduce"
import {Underscore} from "../../../../common-libs/underscore"
import {LevelDBTable} from "../LevelDBTable"
import {pint} from "../../../../common-libs/pint"

export interface WrittenOnData {
  writtenOn: number
}

export class LevelDBWrittenOnIndexer<T extends WrittenOnData> extends LevelDBTable<string[]> {

  constructor(
    name: string,
    getLevelDB: (dbName: string)=> Promise<LevelUp>,
    protected toKey: (t: T) => string) {
    super(name, getLevelDB)
  }

  async onInsert(records: T[]): Promise<void> {
    const byWrittenOn = reduceGroupBy(records, 'writtenOn')
    await Promise.all(Underscore.keys(byWrittenOn).map(async writtenOn => {
      await this.put(LevelDBWrittenOnIndexer.trimWrittenOnKey(pint(writtenOn)), byWrittenOn[writtenOn].map(e => this.toKey(e)))
    }))
  }

  getWrittenOnKeys(writtenOn: number): Promise<string[]|null> {
    return this.getOrNull(LevelDBWrittenOnIndexer.trimWrittenOnKey(writtenOn))
  }

  trim(writtenOn: number): Promise<void> {
    return this.del(LevelDBWrittenOnIndexer.trimWrittenOnKey(writtenOn))
  }

  private static trimWrittenOnKey(writtenOn: number) {
    return String(writtenOn).padStart(10, '0')
  }

  async deleteBelow(writtenOn: number): Promise<string[]> {
    return (await this.deleteWhere({ lt: LevelDBWrittenOnIndexer.trimWrittenOnKey(writtenOn) }))
      .map(kv => kv.value)
      .reduce(reduceConcat, [])
  }

  async deleteAt(writtenOn: number): Promise<string[]> {
    const k = LevelDBWrittenOnIndexer.trimWrittenOnKey(writtenOn)
    const value = await this.getOrNull(k)
    if (!value) {
      // Nothing to delete, nothing to return
      return []
    }
    await this.del(k)
    return value
  }
}

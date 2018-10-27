import {LevelUp} from "levelup";
import {AbstractIteratorOptions} from "abstract-leveldown";
import {NewLogger} from "../../../logger"

export class LevelDBTable<T> {

  private db: LevelUp

  constructor(
    private name: string,
    protected getLevelDB: (dbName: string)=> Promise<LevelUp>,
  ) {
  }

  cleanCache(): void {
  }

  triggerInit(): void {
  }

  async close() {
    NewLogger().debug(`Closing LevelDB ${this.name}...`)
    await this.db.close()
  }

  async init(): Promise<void> {
    this.db = await this.getLevelDB(`${this.name}`)
  }

  public async get(k: string): Promise<T> {
    const data = await this.db.get(k)
    return JSON.parse(String(data)) as any
  }

  public async getOrNull(k: string): Promise<T|null> {

    try {
      const data = await this.db.get(k)
      return JSON.parse(String(data)) as any
    } catch (e) {
      if (!e || e.type !== 'NotFoundError') {
        throw Error(e)
      }
      return null
    }
  }

  public async del(k: string): Promise<void> {
    return await this.db.del(k)
  }

  public async put(k: string, record: T): Promise<void> {
    return await this.db.put(k, JSON.stringify(record))
  }

  public async batchInsert(records: T[], key: keyof T) {
    const batch = records.map(r => {
      return {
        type: 'put',
        key: r[key],
        value: JSON.stringify(r)
      }
    }) as any
    await this.db.batch(batch)
  }

  public async batchInsertWithKeyComputing(records: T[], keyComputing: (record: T) => string) {
    const batch = records.map(r => {
      return {
        type: 'put',
        key: keyComputing(r),
        value: JSON.stringify(r)
      }
    }) as any
    await this.db.batch(batch)
  }

  public async count(options?: AbstractIteratorOptions) {
    let count = 0
    await new Promise(res => {
      this.db.createReadStream(options)
        .on('data', () => count++)
        .on('close', res)
    })
    return count
  }

  public async readAll(callback: (entry: T) => void, options?: AbstractIteratorOptions) {
    await new Promise(res => {
      this.db.createReadStream(options)
        .on('data', data => callback(JSON.parse(String(data.value))))
        .on('close', res)
    })
  }

  public async readAllKeyValue(callback: (entry: {
    key: string,
    value: T
  }) => void, options?: AbstractIteratorOptions) {
    await new Promise(res => {
      this.db.createReadStream(options)
        .on('data', data => callback({
          key: String(data.key),
          value: JSON.parse(String(data.value))
        }))
        .on('close', res)
    })
  }

  public async applyAllKeyValue(callback: (entry: {
    key: string,
    value: T
  }) => Promise<void>, options?: AbstractIteratorOptions) {
    const ops: Promise<void>[] = []
    await new Promise(res => {
      this.db.createReadStream(options)
        .on('data', data => ops.push(callback({
          key: String(data.key),
          value: JSON.parse(String(data.value))
        })))
        .on('close', res)
    })
    await Promise.all(ops)
  }

  public async deleteWhere(options?: AbstractIteratorOptions) {
    const deletedKv: {
      key: string,
      value: T
    }[] = []
    await this.applyAllKeyValue(async kv => {
      deletedKv.push(kv)
      await this.del(kv.key)
    }, options)
    return deletedKv
  }

  public async findAllKeys(options?: AbstractIteratorOptions): Promise<string[]> {
    const data: string[] = []
    await this.readAllKeyValue(kv => {
      data.push(kv.key)
    }, options)
    return data
  }

  public async findAllValues(options?: AbstractIteratorOptions): Promise<T[]> {
    const data: T[] = []
    await this.readAllKeyValue(kv => {
      data.push(kv.value)
    }, options)
    return data
  }

  public async findWhere(filter: (t: T) => boolean): Promise<T[]> {
    return this.findWhereTransform<T>(filter, t => t.value)
  }

  public async findWhereTransform<R>(filter: (t: T) => boolean, transform: (t: {
    key: string,
    value: T
  }) => R): Promise<R[]> {
    const data: R[] = []
    await this.readAllKeyValue(kv => {
      if (!filter || filter(kv.value)) {
        data.push(transform(kv))
      }
    }, {})
    return data
  }

  async dump(dumpValue: (t: {
    key: string,
    value: T
  }) => any = (v) => v): Promise<number> {
    let count = 0
    await this.readAllKeyValue(entry => {
      console.log(entry.key, dumpValue({
        key: entry.key,
        value: entry.value
      }))
      count++
    })
    return count
  }
}

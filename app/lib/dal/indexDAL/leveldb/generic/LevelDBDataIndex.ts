import {LevelDBTable} from "../LevelDBTable"

export abstract class LevelDBDataIndex<T, R> extends LevelDBTable<T> {

  public abstract onInsert(records: R[]): Promise<void>

  public abstract onRemove(records: R[]): Promise<void>

  public async onTrimming(belowNumber: number): Promise<void> {}
}

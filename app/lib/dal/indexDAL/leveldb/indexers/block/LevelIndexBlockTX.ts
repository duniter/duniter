import {DBBlock} from "../../../../../db/DBBlock"
import {LDBIndex_ALL, LevelIndexBlock} from "./LevelIndexBlock"

export class LevelIndexBlockTX extends LevelIndexBlock {

  matches(b: DBBlock): boolean {
    return b.transactions.length > 0
  }

  keys(b: DBBlock): string[] {
    return [LDBIndex_ALL]
  }
}

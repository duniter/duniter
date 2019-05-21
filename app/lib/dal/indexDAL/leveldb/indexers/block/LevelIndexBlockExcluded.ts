import {DBBlock} from "../../../../../db/DBBlock"
import {LDBIndex_ALL, LevelIndexBlock} from "./LevelIndexBlock"

export class LevelIndexBlockExcluded extends LevelIndexBlock {

  matches(b: DBBlock): boolean {
    return b.excluded.length > 0
  }

  keys(b: DBBlock): string[] {
    return b.excluded.concat([LDBIndex_ALL])
  }
}

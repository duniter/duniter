import {DBBlock} from "../../../../../db/DBBlock"
import {LDBIndex_ALL, LevelIndexBlock} from "./LevelIndexBlock"

export class LevelIndexBlockUD extends LevelIndexBlock {

  matches(b: DBBlock): boolean {
    return !!b.dividend
  }

  keys(b: DBBlock): string[] {
    return [LDBIndex_ALL]
  }
}

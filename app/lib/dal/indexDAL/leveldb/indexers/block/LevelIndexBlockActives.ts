import {DBBlock} from "../../../../../db/DBBlock"
import {LDBIndex_ALL, LevelIndexBlock} from "./LevelIndexBlock"
import {MembershipDTO} from "../../../../../dto/MembershipDTO"

export class LevelIndexBlockActives extends LevelIndexBlock {

  matches(b: DBBlock): boolean {
    return b.actives.length > 0
  }

  keys(b: DBBlock): string[] {
    return b.actives
      .map(m => MembershipDTO.fromInline(m))
      .map(m => m.issuer)
      .concat([LDBIndex_ALL])
  }
}

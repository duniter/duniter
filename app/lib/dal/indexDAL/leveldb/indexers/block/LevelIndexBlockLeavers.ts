import {DBBlock} from "../../../../../db/DBBlock"
import {LDBIndex_ALL, LevelIndexBlock} from "./LevelIndexBlock"
import {MembershipDTO} from "../../../../../dto/MembershipDTO"

export class LevelIndexBlockLeavers extends LevelIndexBlock {

  matches(b: DBBlock): boolean {
    return b.leavers.length > 0
  }

  keys(b: DBBlock): string[] {
    return b.leavers
      .map(m => MembershipDTO.fromInline(m))
      .map(m => m.issuer)
      .concat([LDBIndex_ALL])
  }
}

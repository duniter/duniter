import {DBBlock} from "../../../../../db/DBBlock"
import {LDBIndex_ALL, LevelIndexBlock} from "./LevelIndexBlock"
import {MembershipDTO} from "../../../../../dto/MembershipDTO"

export class LevelIndexBlockJoiners extends LevelIndexBlock {

  matches(b: DBBlock): boolean {
    return b.joiners.length > 0
  }

  keys(b: DBBlock): string[] {
    return b.joiners
      .map(m => MembershipDTO.fromInline(m))
      .map(m => m.issuer)
      .concat([LDBIndex_ALL])
  }
}

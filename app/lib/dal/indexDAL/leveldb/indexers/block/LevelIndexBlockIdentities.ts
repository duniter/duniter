import { DBBlock } from "../../../../../db/DBBlock";
import { LDBIndex_ALL, LevelIndexBlock } from "./LevelIndexBlock";
import { IdentityDTO } from "../../../../../dto/IdentityDTO";

export class LevelIndexBlockIdentities extends LevelIndexBlock {
  matches(b: DBBlock): boolean {
    return b.identities.length > 0;
  }

  keys(b: DBBlock): string[] {
    return b.identities
      .map((i) => IdentityDTO.fromInline(i))
      .map((i) => i.pubkey)
      .concat([LDBIndex_ALL]);
  }
}

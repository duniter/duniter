import { DBBlock } from "../../../../../db/DBBlock";
import { LDBIndex_ALL, LevelIndexBlock } from "./LevelIndexBlock";

export class LevelIndexBlockRevoked extends LevelIndexBlock {
  matches(b: DBBlock): boolean {
    return b.revoked.length > 0;
  }

  keys(b: DBBlock): string[] {
    return b.revoked.concat([LDBIndex_ALL]);
  }
}

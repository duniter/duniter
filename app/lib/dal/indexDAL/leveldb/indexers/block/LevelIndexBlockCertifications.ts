import { DBBlock } from "../../../../../db/DBBlock";
import { LDBIndex_ALL, LevelIndexBlock } from "./LevelIndexBlock";
import { CertificationDTO } from "../../../../../dto/CertificationDTO";

export class LevelIndexBlockCertifications extends LevelIndexBlock {
  matches(b: DBBlock): boolean {
    return b.certifications.length > 0;
  }

  keys(b: DBBlock): string[] {
    return b.certifications
      .map((c) => CertificationDTO.fromInline(c))
      .map((c) => [c.from, c.to])
      .reduce((all, some) => all.concat(some), [])
      .concat([LDBIndex_ALL]);
  }
}

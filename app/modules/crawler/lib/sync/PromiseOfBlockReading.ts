import { BlockDTO } from "../../../../lib/dto/BlockDTO";

export interface PromiseOfBlocksReading {
  (): Promise<BlockDTO[]>;
}

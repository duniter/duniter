import { GenericDAO } from "./GenericDAO";
import { DBHead } from "../../../db/DBHead";

export interface BIndexDAO extends GenericDAO<DBHead> {
  head(n: number): Promise<DBHead>; // TODO: possibly null?

  tail(): Promise<DBHead>; // TODO: possibly null?

  range(n: number, m: number): Promise<DBHead[]>;

  trimBlocks(maxnumber: number): Promise<void>;
}

import { DBBlock } from "../db/DBBlock";

export interface ServerDAO {
  // TODO: check that a module is actually using this method
  lastBlockOfIssuer(issuer: string): Promise<DBBlock | null>;
}

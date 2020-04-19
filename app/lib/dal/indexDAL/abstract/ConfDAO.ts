import { ConfDTO, CurrencyConfDTO } from "../../../dto/ConfDTO";
import { Initiable } from "../../sqliteDAL/Initiable";

export interface ConfDAO extends Initiable {
  init(): Promise<void>;

  close(): Promise<void>;

  getParameters(): Promise<CurrencyConfDTO>;

  readRawConfFile(): Promise<string | null>;

  loadConf(): Promise<ConfDTO | {}>;

  saveConf(confToSave: ConfDTO): Promise<void>;
}

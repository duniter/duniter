import {MonitorExecutionTime} from "../../../debug/MonitorExecutionTime"
import {LevelUp} from 'levelup'
import {LevelDBTable} from "./LevelDBTable"
import {DBWallet} from "../../../db/DBWallet"
import {WalletDAO} from "../abstract/WalletDAO"

export class LevelDBWallet extends LevelDBTable<DBWallet> implements WalletDAO {

  constructor(getLevelDB: (dbName: string)=> Promise<LevelUp>) {
    super('level_wallet', getLevelDB)
  }

  /**
   * INSERT
   */

  @MonitorExecutionTime()
  async insert(record: DBWallet): Promise<void> {
    await this.insertBatch([record])
  }

  @MonitorExecutionTime()
  async insertBatch(records: DBWallet[]): Promise<void> {
    await this.batchInsertWithKeyComputing(records, r => r.conditions)
  }

  getWallet(conditions: string): Promise<DBWallet|null> {
    return this.getOrNull(conditions)
  }

  listAll(): Promise<DBWallet[]> {
    return this.findAllValues()
  }

  async saveWallet(wallet: DBWallet): Promise<DBWallet> {
    await this.put(wallet.conditions, wallet)
    return wallet
  }
}

import {WalletDAO} from "../abstract/WalletDAO"
import {LokiCollectionManager} from "./LokiCollectionManager"
import {DBWallet} from "../../../db/DBWallet"
import {MonitorExecutionTime} from "../../../debug/MonitorExecutionTime"
import {LokiDAO} from "./LokiDAO"

export class LokiWallet extends LokiCollectionManager<DBWallet> implements WalletDAO, LokiDAO {

  constructor(loki:any) {
    super(loki, 'wallet', ['conditions'])
  }

  cleanCache(): void {
  }

  @MonitorExecutionTime()
  async getWallet(conditions: string): Promise<DBWallet|null> {
    return this.collection
      .find({ conditions })[0]
  }

  @MonitorExecutionTime()
  async insertBatch(records: DBWallet[]): Promise<void> {
    for (const w of records) {
      this.collection.insert(w)
    }
  }

  @MonitorExecutionTime()
  async saveWallet(wallet: DBWallet): Promise<DBWallet> {
    let updated = false
    this.collection
      .chain()
      .find({ conditions: wallet.conditions })
      .update(w => {
        w.balance = wallet.balance
        updated = true
      })
    if (!updated) {
      await this.insertBatch([wallet])
    }
    return wallet
  }

  async listAll(): Promise<DBWallet[]> {
    return this.collection.find({})
  }
}

import {WalletDAO} from "../abstract/WalletDAO"
import {DBWallet} from "../../sqliteDAL/WalletDAL"
import {LokiCollectionManager} from "./LokiCollectionManager"

export class LokiWallet extends LokiCollectionManager<DBWallet> implements WalletDAO {

  constructor(loki:any) {
    super(loki, 'wallet', ['conditions'])
  }

  cleanCache(): void {
  }

  async getWallet(conditions: string): Promise<DBWallet> {
    return this.collection
      .find({ conditions })[0]
  }

  async insertBatch(records: DBWallet[]): Promise<void> {
    for (const w of records) {
      this.collection.insert(w)
    }
  }

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
}
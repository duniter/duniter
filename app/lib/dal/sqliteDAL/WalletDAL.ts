import {SQLiteDriver} from "../drivers/SQLiteDriver";
import {AbstractSQLite} from "./AbstractSQLite";

export interface DBWallet {
  conditions: string
  balance: number
}

/**
 * Facility table saving the current state of a wallet.
 * @param driver SQL driver for making SQL requests.
 * @constructor
 */
export class WalletDAL extends AbstractSQLite<DBWallet> {

  constructor(driver:SQLiteDriver) {
    super(
      driver,
      'wallet',
      // PK fields
      ['conditions'],
      // Fields
      [
        'conditions',
        'balance'
      ],
      // Arrays
      [],
      // Booleans
      [],
      // BigIntegers
      ['monetaryMass'],
      // Transient
      []
    )
  }

  async init() {
    await this.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + this.table + ' (' +
      'conditions TEXT NOT NULL,' +
      'balance INTEGER NOT NULL,' +
      'PRIMARY KEY (conditions)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS wallet_balance ON wallet(balance);' +
      'COMMIT;')
  }

  getWallet(conditions:string) {
    return this.sqlFindOne({ conditions })
  }

  saveWallet(wallet:DBWallet) {
    return this.saveEntity(wallet)
  }
}

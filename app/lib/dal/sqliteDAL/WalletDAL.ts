// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

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

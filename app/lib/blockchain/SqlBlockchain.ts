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

"use strict"
import {BlockchainOperator} from "./interfaces/BlockchainOperator"

const indexer = require('../../lib/indexer').Indexer

export class SQLBlockchain implements BlockchainOperator {

  constructor(private dal: { bindexDAL:any }) {
  }

  store(b: any): Promise<any> {
    return this.dal.bindexDAL.saveEntity(b)
  }

  read(i: number): Promise<any> {
    return this.dal.bindexDAL.sqlFindOne({ number: i })
  }

  async head(n = 0): Promise<any> {
    /**
     * IMPORTANT NOTICE
     * ----------------
     *
     * There is a difference between the protocol's HEAD (P_HEAD) and the database's HEAD (DB_HEAD). The relation is:
     *
     *     DB_HEAD~<i> = P_HEAD~<i+1>
     *
     * In this class methods, we expose DB_HEAD logic. But the data is stored/retrieved by DAL objects using P_HEAD logic.
     *
     * So if we want DB_HEAD~0 for example, we must ask P_HEAD~(0+1). The DAL object will then retrieve P_HEAD~1, which
     * is the latest stored block in the blockchain.
     *
     * Note: the DAL object cannot retrieve P_HEAD~0, this value does not exist and refers to the potential incoming block.
     *
     * Why this behavior?
     * ------------------
     *
     * Because the DAL was wrongly coded. It will be easy to fix this problem once indexer.js will only use **this class'
     * methods**. Then, we will be able to replace (n + 1) by just (n), and replace also the complementary behavior in
     * the DAL (BIndexDAL).
     */
    return this.dal.bindexDAL.head(n + 1)
  }

  async height(): Promise<number> {
    const head = await this.dal.bindexDAL.head(1) // We do not use head(0). See the above notice.
    if (head) {
      return head.number + 1
    } else {
      return 0
    }
  }

  headRange(m: number): Promise<any[]> {
    return this.dal.bindexDAL.range(1, m) // We do not use range(0, m). See the above notice.
  }

  async revertHead(): Promise<any> {
    const head = await this.dal.bindexDAL.head(1) // We do not use head(0). See the above notice.
    await this.dal.bindexDAL.removeBlock(head.number)
    return head
  }
}

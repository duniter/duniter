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

import {BlockchainOperator} from "../../../app/lib/blockchain/interfaces/BlockchainOperator"

export class ArrayBlockchain implements BlockchainOperator {

  // The blockchain storage
  private bcArray: any[] = []

  store(b:any): Promise<any> {
    this.bcArray.push(b)
    return Promise.resolve(b)
  }

  read(i: number): Promise<any> {
    return Promise.resolve(this.bcArray[i])
  }

  head(n: number): Promise<any> {
    const index = Math.max(0, this.bcArray.length - 1 - (n || 0))
    return Promise.resolve(this.bcArray[index])
  }

  height(): Promise<number> {
    return Promise.resolve(this.bcArray.length)
  }

  headRange(m: number): Promise<any[]> {
    const index = Math.max(0, this.bcArray.length - (m || 0))
    return Promise.resolve(this.bcArray.slice(index, this.bcArray.length).reverse())
  }

  revertHead(): Promise<any> {
    const reverted = this.bcArray.pop()
    return Promise.resolve(reverted)
  }
}

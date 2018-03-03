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

export interface BlockchainOperator {

  /**
   * Pushes a new block at the top of the blockchain.
   * @param b Block.
   */
  store(b:any):Promise<any>

  /**
   * Reads the block at index `i`.
   * @param i Block number.
   */
  read(i:number):Promise<any>

  /**
   * Reads the block at index `n` from the top of the blockchain.
   * @param n Reverse index.
   */
  head(n:number):Promise<any>

  /**
   * Gives the number of blocks in the blockchain.
   */
  height():Promise<number>

  /**
   * Reads the blocks from head(0) to head(m)
   * @param m Quantity.
   */
  headRange(m:number):Promise<any[]>

  /**
   * Pops the top block.
   */
  revertHead():Promise<any>
}

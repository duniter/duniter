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

export class BasicBlockchain {

  constructor(private op:BlockchainOperator) {
  }

  /**
   * Adds a block at the end of the blockchain.
   */
  pushBlock(b:any) {
    return this.op.store(b)
  }

  /**
   * Get the block identified by `number`
   * @param number block ID.
   * @returns {*} Promise<Block>
   */
  getBlock(number:number) {
    return this.op.read(number)
  }

  /**
   * Get the nth block from the top of the blockchain.
   * @param index Index from top. Defaults to `0`. E.g. `0` = HEAD, `1` = HEAD~1, etc.
   * @returns {*} Promise<Block>
   */
  head(index = 0) {
    return this.op.head(index)
  }

  /**
   * Blockchain size, in number of blocks.
   * @returns {*} Size.
   */
  height() {
    return this.op.height()
  }

  /**
   * Get the (n+1)th blocks top blocks of the blockchain, ordered by number ascending.
   * @param n Quantity from top. E.g. `1` = [HEAD], `3` = [HEAD, HEAD~1, HEAD~2], etc.
   * @returns {*} Promise<Block>
   */
  headRange(n:number) {
    return this.op.headRange(n)
  }

  /**
   * Pops the blockchain HEAD.
   * @returns {*} Promise<Block> The reverted block.
   */
  revertHead() {
    return this.op.revertHead()
  }
}

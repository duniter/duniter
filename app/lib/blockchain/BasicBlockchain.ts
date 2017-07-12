"use strict"
import {BlockchainOperator} from "./interfaces/BlockchainOperator"

export class BasicBlockchain {

  constructor(private op:BlockchainOperator) {
  }

  /**
   * Adds a block at the end of the blockchain.
   */
  pushBlock(b) {
    return this.op.store(b)
  }

  /**
   * Get the block identified by `number`
   * @param number block ID.
   * @returns {*} Promise<Block>
   */
  getBlock(number) {
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
  headRange(n) {
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

"use strict"

export interface BlockchainOperator {

  /**
   * Pushes a new block at the top of the blockchain.
   * @param b Block.
   */
  store(b):Promise<any>

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

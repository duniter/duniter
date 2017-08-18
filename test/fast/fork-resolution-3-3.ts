import * as assert from 'assert'
import {SwitchBlock, Switcher, SwitcherDao} from "../../app/lib/blockchain/Switcher"

describe("Fork resolution 3-3 algo", () => {

  it('should switch on a valid fork', () => {

    // B10 -- B11 -- B12 -- B13
    //  |         `- C12 -- C13 -- C14 -- C15 -- C16
    //  |
    //  `- (= B13 - ForkWindowSize)

    const bc = new Blockchain(Block.from("B10"))
    bc.add(Block.from("B11"))
    bc.add(Block.from("B12"))
    bc.add(Block.from("B13"))
    assert.equal(bc.current.number, 13)
    const sbx = new BlockSandbox([
      Block.from("C12", "B11"),
      Block.from("C13"),
      Block.from("C14"),
      Block.from("C15"),
      Block.from("C16")
    ])
    const switcher = new Switcher(new TestingSwitcherDao(bc, sbx), avgGenTime, forkWindowSize)
    switcher.tryToFork()
    assert.equal(bc.current.number, 16)
    assert.equal(bc.current.hash, "C16")
  })

  it('should not switch if no fork block 3-3 exist', async () => {

    // B10 -- B11 -- B12 -- B13
    //  |         `- C12 -- C13 -- C14 -- C15
    //  |
    //  `- (= B13 - ForkWindowSize)

    const bc = new Blockchain(Block.from("B10"))
    bc.add(Block.from("B11"))
    bc.add(Block.from("B12"))
    bc.add(Block.from("B13"))
    assert.equal(bc.current.number, 13)
    const sbx = new BlockSandbox([
      Block.from("C12", "B11"),
      Block.from("C13"),
      Block.from("C14"),
      Block.from("C15")
    ])
    const switcher = new Switcher(new TestingSwitcherDao(bc, sbx), avgGenTime, forkWindowSize)
    switcher.tryToFork()
    assert.equal(bc.current.number, 13)
    assert.equal(bc.current.hash, "B13")
  })

  it('should eliminate a fork with missing blocks', async () => {

    // B10 -- B11 -- B12 -- B13
    //  |         `- C12 -- C13 -- C14 -- C15 -- C16
    //  |
    //  `- (= B13 - ForkWindowSize)

    const bc = new Blockchain(Block.from("B10"))
    bc.add(Block.from("B11"))
    bc.add(Block.from("B12"))
    bc.add(Block.from("B13"))
    assert.equal(bc.current.number, 13)
    const sbx = new BlockSandbox([
      Block.from("C14"),
      Block.from("C15")
    ])
    const switcher = new Switcher(new TestingSwitcherDao(bc, sbx), avgGenTime, forkWindowSize)
    switcher.tryToFork()
    assert.equal(bc.current.number, 13)
    assert.equal(bc.current.hash, "B13")
  })

  it('should eliminate a fork out of fork window', async () => {

    // B10 -- B11 -- B12 -- B13
    //  +  -- C11 -- C12 -- C13 -- C14 -- C15 -- C16
    //  |
    //  `- (= B13 - ForkWindowSize)

    const bc = new Blockchain(Block.from("B10"))
    bc.add(Block.from("B11"))
    bc.add(Block.from("B12"))
    bc.add(Block.from("B13"))
    assert.equal(bc.current.number, 13)
    const sbx = new BlockSandbox([
      Block.from("C10"),
      Block.from("C11"),
      Block.from("C12"),
      Block.from("C13"),
      Block.from("C14"),
      Block.from("C15"),
      Block.from("C16")
    ])
    const switcher = new Switcher(new TestingSwitcherDao(bc, sbx), avgGenTime, forkWindowSize)
    switcher.tryToFork()
    assert.equal(bc.current.number, 13)
    assert.equal(bc.current.hash, "B13")
  })

  it('should accept a fork right on the limit of the fork window', async () => {

    // B10 -- B11 -- B12 -- B13
    //  |` -- C11 -- C12 -- C13 -- C14 -- C15 -- C16
    //  |
    //  `- (= B13 - ForkWindowSize)

    const bc = new Blockchain(Block.from("B10"))
    bc.add(Block.from("B11"))
    bc.add(Block.from("B12"))
    bc.add(Block.from("B13"))
    assert.equal(bc.current.number, 13)
    const sbx = new BlockSandbox([
      Block.from("C11", "B10"),
      Block.from("C12"),
      Block.from("C13"),
      Block.from("C14"),
      Block.from("C15"),
      Block.from("C16")
    ])
    const switcher = new Switcher(new TestingSwitcherDao(bc, sbx), avgGenTime, forkWindowSize)
    switcher.tryToFork()
    assert.equal(bc.current.number, 16)
    assert.equal(bc.current.hash, "C16")
  })

  it('should eliminate a fork whose 2nd block is invalid', async () => {

    // B10 -- B11 -- B12 -- B13
    //  |         `- C12 -- C13 -- C14 -- C15 -- C16
    //  |
    //  `- (= B13 - ForkWindowSize)

    const bc = new Blockchain(Block.from("B10"))
    bc.add(Block.from("B11"))
    bc.add(Block.from("B12"))
    bc.add(Block.from("B13"))
    assert.equal(bc.current.number, 13)
    const sbx = new BlockSandbox([
      Block.from("C12", "B11"),
      Block.from("C13"),
      Block.from("C14", "", () => false),
      Block.from("C15"),
      Block.from("C16")
    ])
    const switcher = new Switcher(new TestingSwitcherDao(bc, sbx), avgGenTime, forkWindowSize)
    switcher.tryToFork()
    assert.equal(bc.current.number, 13)
    assert.equal(bc.current.hash, "B13")
  })

  it('should select the longest fork', async () => {

    // B10 -- B11 -- B12 -- B13
    //  |         `- C12 -- C13 -- C14 -- C15 -- C16
    //  |                `- D13 -- D14 -- D15 -- D16 -- D17
    //  |
    //  `- (= B13 - ForkWindowSize)

    const bc = new Blockchain(Block.from("B10"))
    bc.add(Block.from("B11"))
    bc.add(Block.from("B12"))
    bc.add(Block.from("B13"))
    assert.equal(bc.current.number, 13)
    const sbx = new BlockSandbox([
      Block.from("C12", "B11"),
      Block.from("C13"),
      Block.from("C14"),
      Block.from("C15"),
      Block.from("C16"),
      Block.from("D13", "C12"),
      Block.from("D14"),
      Block.from("D15"),
      Block.from("D16"),
      Block.from("D17")
    ])
    const switcher = new Switcher(new TestingSwitcherDao(bc, sbx), avgGenTime, forkWindowSize)
    switcher.tryToFork()
    assert.equal(bc.current.number, 17)
    assert.equal(bc.current.hash, "D17")
  })
})

const avgGenTime = 5 * 60
const forkWindowSize = 3

class TestingSwitcherDao implements SwitcherDao {

  getCurrent(): SwitchBlock {
    return this.bc.current
  }

  getPotentials(numberStart:number, timeStart:number) {
    return this.sbx.getPotentials(numberStart, timeStart)
  }


  getBlockchainBlock(number: number, hash: string): SwitchBlock|null {
    return this.bc.getBlock(number, hash)
  }


  getSandboxBlock(number: number, hash: string): SwitchBlock | any {
    return this.sbx.getBlock(number, hash)
  }

  revertTo(number: number): SwitchBlock[] {
    return this.bc.revertTo(number)
  }

  addBlock(block: Block): SwitchBlock {
    return this.bc.add(block)
  }

  constructor(private bc:Blockchain, private sbx:BlockSandbox) {}
}

/**
 * A super simple sandbox for new blocks.
 */
class BlockSandbox {

  constructor(private blocks:Block[] = []) {}

  /**
   * Gets a particular block.
   * @param number The block number.
   * @param {hash} hash The block hash.
   * @returns The block or null if it was not found.
   */
  getBlock(number:number, hash:string) {
    for (const b of this.blocks) {
      if (b.number === number && b.hash === hash) {
        return b
      }
    }
    return null
  }

  /**
   * Retrieves all the candidate blocks for the switch.
   * @param numberStart Will pick blocks whose number >= numberStart
   * @param timeStart
   * @returns The candidate blocks.
   */
  getPotentials(numberStart:number, timeStart:number) {
    const potentials = []
    for (const b of this.blocks) {
      if (b.number >= numberStart && b.medianTime >= timeStart) {
        potentials.push(b)
      }
    }
    return potentials
  }
}

/**
 * A super simple blockchain
 */
class Blockchain {

  private blocks:Block[] = []

  /**
   * The root block of the blockchain (does not need to have number `0`).
   * @param {Block} rootBlock
   */
  constructor(rootBlock:Block) {
    this.blocks.push(rootBlock)
  }

  /**
   * Returns the current block (HEAD) of the blockchain.
   * @returns {Block}
   */
  get current() {
    return this.blocks[this.blocks.length - 1]
  }

  /**
   * Adds a block on top of HEAD.
   * @param {Block} block
   * @returns {Block}
   */
  add(block:Block) {
    if (!block.chainsOn(this.current)) {
      throw "Unchainable"
    }
    this.blocks.push(block)
    return block
  }

  /**
   * Gets a particular block.
   * @param number The block number.
   * @param hash The block hash.
   * @returns The block or null if it was not found.
   */
  getBlock(number:number, hash:string) {
    for (const b of this.blocks) {
      if (b.number === number && b.hash === hash) {
        return b
      }
    }
    return null
  }

  /**
   * Pops blocks from HEAD to HEAD - number.
   * @param number The block number that will be our new HEAD.
   * @returns {Block[]}
   */
  revertTo(number:number) {
    const reverted:Block[] = []
    if (this.current.number < number) {
      throw "Already below this number"
    }
    while (this.current.number > number) {
      const poped:Block = this.blocks.pop() as Block
      reverted.push(poped)
    }
    return reverted
  }
}

class Block implements SwitchBlock {

  private constructor(public chain:string, public number:number, private thePreviousHash:string, private chainsOnHook: (previous:Block)=>boolean = () => true) {
  }

  get hash() {
    return [this.chain, this.number].join('')
  }

  get medianTime() {
    return this.number * avgGenTime
  }

  get previousHash() {
    return this.thePreviousHash || [this.chain, this.number - 1].join('')
  }

  chainsOn(previous:Block) {
    return this.number === previous.number + 1 && (this.chain === previous.chain || this.previousHash === previous.hash) && this.chainsOnHook(previous)
  }

  static from(hash:string, previousHash = "", chainsOnHook: undefined|((previous:Block)=>boolean) = undefined) {
    const match = hash.match(/([A-Z])(\d+)/)
    const chain = match && match[1] || ""
    const number = parseInt(match && match[2] || "0")
    return new Block(chain, number, previousHash, chainsOnHook)
  }
}
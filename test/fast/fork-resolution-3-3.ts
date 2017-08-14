import * as assert from 'assert'

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
    const switcher = new BlockchainSwitcher(bc, sbx)
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
    const switcher = new BlockchainSwitcher(bc, sbx)
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
    const switcher = new BlockchainSwitcher(bc, sbx)
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
    const switcher = new BlockchainSwitcher(bc, sbx)
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
    const switcher = new BlockchainSwitcher(bc, sbx)
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
    const switcher = new BlockchainSwitcher(bc, sbx)
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
    const switcher = new BlockchainSwitcher(bc, sbx)
    switcher.tryToFork()
    assert.equal(bc.current.number, 17)
    assert.equal(bc.current.hash, "D17")
  })
})

const avgGenTime = 5 * 60
const forkWindowSize = 3

class BlockchainSwitcher {

  constructor(private bc:Blockchain, private sbx:BlockSandbox) {}

  tryToFork() {
    const current = this.bc.current
    const numberStart = current.number + 3
    const timeStart = current.time + 3*avgGenTime
    const suites:Block[][] = []
    const potentials:Block[] = this.sbx.getPotentials(numberStart, timeStart)
    const invalids: { [hash:string]: Block } = {}
    // Phase 1: find chains
    for (const candidate of potentials) {
      const suite:Block[] = []
      if (!invalids[candidate.hash] && !BlockchainSwitcher.suitesContains(suites, candidate)) {
        let previous:Block|null = candidate, commonRootFound = false
        while (previous && previous.number > current.number - forkWindowSize) {
          suite.push(previous)
          const previousNumber = previous.number - 1
          const previousHash = previous.previousHash
          previous = this.bc.getBlock(previousNumber, previousHash)
          if (previous) {
            // Stop the loop: common block has been found
            previous = null
            suites.push(suite)
            commonRootFound = true
          } else {
            // Have a look in sandboxes
            previous = this.sbx.getBlock(previousNumber, previousHash)
          }
        }
        // Forget about invalid blocks
        if (!commonRootFound) {
          for (const b of suite) {
            invalids[b.hash] = b
          }
        }
      }
    }
    // Phase 2: select the best chain
    let longestChain:null|Block[] = null
    for (const s of suites) {
      s.reverse()
      const reverted = this.bc.revertTo(s[0].number - 1)
      let added = true, i = 0, successfulBlocks:Block[] = []
      while (added) {
        try {
          this.bc.add(s[i])
          successfulBlocks.push(s[i])
        } catch (e) {
          added = false
        }
        i++
      }
      if (successfulBlocks.length) {
        this.bc.revertTo(this.bc.current.number - successfulBlocks.length)
      }
      reverted.reverse()
      for (const b of reverted) {
        this.bc.add(b)
      }
      if ((!longestChain && successfulBlocks.length > 0) || (longestChain && longestChain.length < successfulBlocks.length)) {
        longestChain = successfulBlocks
      }
    }
    // Phase 3: a best exist? apply it if it respects the 3-3 rule
    if (longestChain) {
      const b = longestChain[longestChain.length - 1]
      if (b.number >= numberStart && b.time >= timeStart) {
        this.bc.revertTo(longestChain[0].number - 1)
        for (const b of longestChain) {
          this.bc.add(b)
        }
      }
    }
    return this.bc.current
  }

  static suitesContains(suites:Block[][], block:Block) {
    for (const suite of suites) {
      for (const b of suite) {
        if (b.number === block.number && b.hash === block.hash) {
          return true
        }
      }
    }
    return false
  }
}

class BlockSandbox {

  constructor(private blocks:Block[] = []) {}

  getBlock(number:number, hash:string) {
    for (const b of this.blocks) {
      if (b.number === number && b.hash === hash) {
        return b
      }
    }
    return null
  }

  getPotentials(numberStart:number, timeStart:number) {
    const potentials = []
    for (const b of this.blocks) {
      if (b.number >= numberStart && b.time >= timeStart) {
        potentials.push(b)
      }
    }
    return potentials
  }
}


class Blockchain {

  private blocks:Block[] = []

  constructor(rootBlock:Block) {
    this.blocks.push(rootBlock)
  }

  get current() {
    return this.blocks[this.blocks.length - 1]
  }

  add(block:Block) {
    if (!block.chainsOn(this.current)) {
      throw "Unchainable"
    }
    this.blocks.push(block)
    return block
  }

  getBlock(number:number, hash:string) {
    for (const b of this.blocks) {
      if (b.number === number && b.hash === hash) {
        return b
      }
    }
    return null
  }

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

class Block {

  private constructor(public chain:string, public number:number, private thePreviousHash:string, private chainsOnHook: (previous:Block)=>boolean = () => true) {
  }

  get hash() {
    return [this.chain, this.number].join('')
  }

  get time() {
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
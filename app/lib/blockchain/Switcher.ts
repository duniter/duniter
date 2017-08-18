export interface SwitchBlock {

  number:number
  hash:string
  previousHash:string
  medianTime:number
}

export interface SwitcherDao {

  getCurrent(): SwitchBlock
  getPotentials(numberStart:number, timeStart:number): SwitchBlock[]
  getBlockchainBlock(number:number, hash:string): SwitchBlock|null
  getSandboxBlock(number:number, hash:string): SwitchBlock|null
  revertTo(number:number): SwitchBlock[]
  addBlock(block:SwitchBlock): SwitchBlock
}

export class Switcher {

  constructor(private dao:SwitcherDao, private avgGenTime:number, private forkWindowSize:number) {}

  /**
   * Looks at known blocks in the sandbox and try to follow the longest resulting chain that has at least both 3 blocks of
   * advance and 3 * avgGenTime of medianTime advancce.
   * @returns {SwitchBlock}
   */
  tryToFork() {
    const current = this.dao.getCurrent()
    const numberStart = current.number + 3
    const timeStart = current.medianTime + 3 * this.avgGenTime
    // Phase 1: find potential chains
    const suites = this.findPotentialSuites(current, numberStart, timeStart)
    // Phase 2: select the best chain
    let longestChain:null|SwitchBlock[] = this.findLongestChain(suites)
    // Phase 3: a best exist?
    if (longestChain) {
      const chainHEAD = longestChain[longestChain.length - 1]
      // apply it if it respects the 3-3 rule
      if (chainHEAD.number >= numberStart && chainHEAD.medianTime >= timeStart) {
        this.switchOnChain(longestChain)
      }
    }
    return this.dao.getCurrent()
  }

  /**
   * Looks at the potential blocks that could form fork chains in the sandbox, and sort them to have a maximum of unique
   * chains.
   * @param {SwitchBlock} current HEAD of local blockchain.
   * @param {number} numberStart The minimum number of a fork block.
   * @param {number} timeStart The minimum medianTime of a fork block.
   * @returns {SwitchBlock[][]} The suites found.
   */
  private findPotentialSuites(current:SwitchBlock, numberStart:number, timeStart:number) {
    const suites:SwitchBlock[][] = []
    const potentials:SwitchBlock[] = this.dao.getPotentials(numberStart, timeStart)
    const invalids: { [hash:string]: SwitchBlock } = {}
    for (const candidate of potentials) {
      const suite:SwitchBlock[] = []
      // Do not process the block if it is already known as invalid (has no fork point with current blockchain or misses
      // some blocks) or is already contained in a valid chain.
      if (!invalids[candidate.hash] && !Switcher.suitesContains(suites, candidate)) {
        // Tries to build up a full chain that is linked to current chain by a fork point.
        let previous:SwitchBlock|null = candidate, commonRootFound = false
        while (previous && previous.number > current.number - this.forkWindowSize) {
          suite.push(previous)
          const previousNumber = previous.number - 1
          const previousHash = previous.previousHash
          previous = this.dao.getBlockchainBlock(previousNumber, previousHash)
          if (previous) {
            // Stop the loop: common block has been found
            previous = null
            suites.push(suite)
            commonRootFound = true
          } else {
            // Have a look in sandboxes
            previous = this.dao.getSandboxBlock(previousNumber, previousHash)
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
    return suites
  }

  /**
   * Find the longest chain among a suite of chains. Tests the validity of each block against the current blockchain.
   * The length of a chain is the number of blocks successfuly added to current blockchain.
   * @param {SwitchBlock[][]} suites
   * @returns {SwitchBlock[]}
   */
  private findLongestChain(suites:SwitchBlock[][]) {
    let longestChain:null|SwitchBlock[] = null
    for (const s of suites) {
      s.reverse()
      // Revert current blockchain to fork point
      const reverted = this.dao.revertTo(s[0].number - 1)
      // Try to add a maximum of blocks
      let added = true, i = 0, successfulBlocks:SwitchBlock[] = []
      while (added) {
        try {
          this.dao.addBlock(s[i])
          successfulBlocks.push(s[i])
        } catch (e) {
          added = false
        }
        i++
      }
      // Pop the successfuly added blocks
      if (successfulBlocks.length) {
        this.dao.revertTo(this.dao.getCurrent().number - successfulBlocks.length)
      }
      // Push back the initial blocks that were temporarily reverted
      reverted.reverse()
      for (const b of reverted) {
        this.dao.addBlock(b)
      }
      // Remember the chain if it is the longest among tested chains
      if ((!longestChain && successfulBlocks.length > 0) || (longestChain && longestChain.length < successfulBlocks.length)) {
        longestChain = successfulBlocks
      }
    }
    return longestChain
  }

  /**
   * Switch current blockchain on another chain, by poping top blocks and replacing them by new ones.
   * @param {SwitchBlock[]} chain
   */
  private switchOnChain(chain:SwitchBlock[]) {
    this.dao.revertTo(chain[0].number - 1)
    for (const b of chain) {
      this.dao.addBlock(b)
    }
  }

  /**
   * Checks if a suite of chains contains a particular block in one of its chains.
   * @param {SwitchBlock[][]} suites
   * @param {SwitchBlock} block
   * @returns {boolean}
   */
  static suitesContains(suites:SwitchBlock[][], block:SwitchBlock) {
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
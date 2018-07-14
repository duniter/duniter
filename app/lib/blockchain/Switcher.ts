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

import {BlockDTO} from "../dto/BlockDTO"

export interface SwitchBlock {

  number:number
  hash:string
  previousHash:string
  medianTime:number
}

export interface SwitcherDao<T extends SwitchBlock> {

  getCurrent(): Promise<T|null>
  getPotentials(numberStart:number, timeStart:number, maxNumber:number): Promise<T[]>
  getBlockchainBlock(number:number, hash:string): Promise<T|null>
  getAbsoluteBlockInForkWindow(number:number, hash:string): Promise<T|null>
  revertTo(number:number): Promise<T[]>
  addBlock(block:T): Promise<T>
}

export class Switcher<T extends SwitchBlock> {

  constructor(
    private dao:SwitcherDao<T>,
    private invalidForks:string[],
    private avgGenTime:number,
    private forkWindowSize:number,
    private switchOnHeadAdvance:number,
    private logger:any = undefined) {}

  /**
   * Looks at known blocks in the sandbox and try to follow the longest resulting chain that has at least both 3 blocks of
   * advance and 3 * avgGenTime of medianTime advancce.
   */
  async tryToFork() {
    const current = await this.dao.getCurrent()
    if (current) {
      const numberStart = current.number + this.switchOnHeadAdvance
      const timeStart = current.medianTime + this.switchOnHeadAdvance * this.avgGenTime
      // Phase 1: find potential chains
      const suites = await this.findPotentialSuites(numberStart, timeStart)
      if (suites.length) {
        this.logger && this.logger.info("Fork resolution: %s potential suite(s) found...", suites.length)
      }
      // Phase 2: select the best chain
      let longestChain:null|T[] = await this.findLongestChain(current, suites)
      // Phase 3: a best exist?
      if (longestChain) {
        const chainHEAD = longestChain[longestChain.length - 1]
        // apply it if it respects the 3-3 rule
        if (chainHEAD.number >= numberStart && chainHEAD.medianTime >= timeStart) {
          await this.switchOnChain(longestChain)
          return await this.dao.getCurrent()
        }
      }
    }
    return null
  }

  /**
   * Find all the suites' HEAD that we could potentially fork on, in the current fork window.
   * @param current
   */
  async findPotentialSuitesHeads(current:{ number:number, medianTime:number }) {
    const numberStart = current.number - this.forkWindowSize
    const timeStart = current.medianTime - this.forkWindowSize * this.avgGenTime
    const suites = await this.findPotentialSuites(numberStart, timeStart)
    return suites.map(suite => suite[suite.length - 1])
  }

  /**
   * Looks at the potential blocks that could form fork chains in the sandbox, and sort them to have a maximum of unique
   * chains.
   * @param numberStart The minimum number of a fork block.
   * @param timeStart The minimum medianTime of a fork block.
   * @returns {SwitchBlock[][]} The suites found.
   */
  private async findPotentialSuites(numberStart:number, timeStart:number) {
    const suites:T[][] = []
    const potentials:T[] = await this.dao.getPotentials(numberStart, timeStart, numberStart + this.forkWindowSize)
    const knownForkBlocks:{ [k:string]: boolean } = {}
    for (const candidate of potentials) {
      knownForkBlocks[BlockDTO.fromJSONObject(candidate).blockstamp] = true
    }
    const invalids: { [hash:string]: T } = {}
    if (potentials.length) {
      this.logger && this.logger.info("Fork resolution: %s potential block(s) found...", potentials.length)
    }
    for (const candidate of potentials) {
      const suite:T[] = []
      // Do not process the block if it is already known as invalid (has no fork point with current blockchain or misses
      // some blocks) or is already contained in a valid chain.
      if (!invalids[candidate.hash] && !Switcher.suitesContains(suites, candidate)) {
        // Tries to build up a full chain that is linked to current chain by a fork point.
        let previous:T|null = candidate, commonRootFound = false
        let previousNumber:number = previous.number - 1
        let previousHash:string = previous.previousHash
        while (previous && previous.number > candidate.number - this.forkWindowSize) {
          suite.push(previous)
          previousNumber = previous.number - 1
          previousHash = previous.previousHash
          previous = null
          const previousBlockstamp = [previousNumber, previousHash].join('-')
          // We try to look at blockchain if, of course, it is not already known as a fork block
          // Otherwise it cost a useless DB access
          if (!knownForkBlocks[previousBlockstamp]) {
            previous = await this.dao.getBlockchainBlock(previousNumber, previousHash)
          }
          if (previous) {
            // Stop the loop: common block has been found
            previous = null
            suites.push(suite)
            commonRootFound = true
          } else {
            // Have a look in sandboxes
            previous = await this.dao.getAbsoluteBlockInForkWindow(previousNumber, previousHash)
            if (previous) {
              knownForkBlocks[BlockDTO.fromJSONObject(previous).blockstamp] = true
              const alreadyKnownInvalidBlock = this.invalidForks.indexOf([previous.number, previous.hash].join('-')) !== -1
              if (alreadyKnownInvalidBlock) {
                // Incorrect = not found
                this.logger && this.logger.info("Fork resolution: block #%s-%s is known as incorrect. Skipping.", previous.number, previous.hash.substr(0, 8))
                previous = null
              }
            }
          }
        }
        // Forget about invalid blocks
        if (!commonRootFound) {
          if (!previous) {
            this.logger && this.logger.debug("Suite -> %s-%s missing block#%s-%s", candidate.number, candidate.hash.substr(0, 8), previousNumber, previousHash.substr(0, 8))
            for (const b of suite) {
              invalids[b.hash] = b
            }
          } else {
            // The chain would be too long, we could not revert correctly the chain.
            this.logger && this.logger.debug("Suite #%s-%s -> %s-%s out of fork window", previousNumber, previousHash.substr(0, 8), candidate.number, candidate.hash.substr(0, 8))
          }
        }
      }
    }
    return suites
  }

  /**
   * Find the longest chain among a suite of chains. Tests the validity of each block against the current blockchain.
   * The length of a chain is the number of blocks successfuly added to current blockchain.
   * @param {SwitchBlock} current
   * @param {SwitchBlock[][]} suites
   * @returns {SwitchBlock[]}
   */
  private async findLongestChain(current:T, suites:T[][]) {
    if (suites.length) {
      this.logger && this.logger.info("Fork resolution: HEAD = block#%s", current.number)
    }
    let longestChain:null|T[] = null
    let j = 0
    for (const s of suites) {
      j++
      s.reverse()
      // Revert current blockchain to fork point
      const forkPoint = s[0].number - 1
      const forkHead = s[s.length - 1]
      this.logger && this.logger.info("Fork resolution: suite %s/%s (-> #%s-%s) revert to fork point block#%s", j, suites.length, forkHead.number, forkHead.hash.substr(0, 6), forkPoint)
      const reverted = await this.dao.revertTo(s[0].number - 1)
      // Try to add a maximum of blocks
      let added = true, i = 0, successfulBlocks:T[] = []
      while (added && i < s.length) {
        try {
          await this.dao.addBlock(s[i])
          this.logger && this.logger.info("Fork resolution: suite %s/%s added block#%s-%s", j, suites.length, s[i].number, s[i].hash)
          successfulBlocks.push(s[i])
        } catch (e) {
          this.invalidForks.push([s[i].number, s[i].hash].join('-'))
          this.logger && this.logger.info("Fork resolution: suite %s/%s REFUSED block#%s: %s", j, suites.length, s[0].number + i, e && e.message)
          added = false
        }
        i++
      }
      // Pop the successfuly added blocks
      if (successfulBlocks.length) {
        for (const b of successfulBlocks) {
          this.invalidForks.push([b.number, b.hash].join('-'))
        }
        const addedToHeadLevel = successfulBlocks[successfulBlocks.length-1].number - current.number
        this.logger && this.logger.info("Fork resolution: suite %s/%s reached HEAD + %s. Now rolling back.", j, suites.length, addedToHeadLevel)
        await this.dao.revertTo(forkPoint)
      }
      // Push back the initial blocks that were temporarily reverted
      reverted.reverse()
      for (const b of reverted) {
        await this.dao.addBlock(b)
      }
      // Remember the chain if it is the longest (highest HEAD) among tested chains
      const longestHEAD = longestChain && longestChain[longestChain.length - 1]
      const successHEAD = successfulBlocks && successfulBlocks[successfulBlocks.length - 1]
      if ((!longestHEAD && successHEAD) || (longestHEAD && successHEAD && longestHEAD.number < successHEAD.number)) {
        longestChain = successfulBlocks
      }
    }
    return longestChain
  }

  /**
   * Switch current blockchain on another chain, by poping top blocks and replacing them by new ones.
   * @param {SwitchBlock[]} chain
   */
  private async switchOnChain(chain:T[]) {
    await this.dao.revertTo(chain[0].number - 1)
    for (const b of chain) {
      await this.dao.addBlock(b)
    }
  }

  /**
   * Checks if a suite of chains contains a particular block in one of its chains.
   * @param {SwitchBlock[][]} suites
   * @param {SwitchBlock} block
   */
  static suitesContains<T extends SwitchBlock>(suites:T[][], block:T) {
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
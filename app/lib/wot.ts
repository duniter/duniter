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

const wotb = require('wotb');

export interface WoTBInstance {

  readonly instanceID:number
  readonly filePath:string

  /**
   * Gets this instance ID.
   * @returns {number} The instance technical ID.
   */
  getId(): number

  /**
   * Makes a memory copy of the WoT instance, and returns this new instance.
   * @returns {WoTBInstance} The new memory instance.
   */
  memCopy(): WoTBInstance

  /**
   * Makes a file copy of the WoT instance, and returns this new instance.
   * @returns {WoTBInstance} The new file instance.
   */
  fileCopy(path: string): WoTBInstance

  /**
   * Remove the WoT from the computer's memory.
   */
  clear(): void

  /**
   * Returns a dump of the WoT as a string.
   * @returns {string} The dump.
   */
  dumpWoT(): string

  /**
   * Makes a dump of the WoT on standard output.
   */
  showGraph(): void

  /**
   * Removes any node and certification from the WoT.
   */
  resetWoT(): void

  /**
   * Gets the total number of nodes in the WoT, enabled or not.
   * @returns {number} The total of nodes ever added to the WoT.
   */
  getWoTSize(): number

  /**
   * Add a node and returns its wotb_id.
   * @returns {number} The new node identifier.
   */
  addNode(): number

  /**
   * Remove the lastly added node from the WoT, as well as the certifications it received.
   */
  removeNode(): void

  /**
   * Sets the maximum number of certifications a node can emit.
   * @param {number} max The maximum number of emitted certifications.
   */
  setMaxCert(max:number): void

  /**
   * Gets the maximum number of certifications a node can emit in the WoT.
   * @returns {number} The maximum's value.
   */
  getMaxCert(): number

  /**
   * Tells wether a node is enabled or not (= member or not).
   * @param node Node's ID.
   * @returns {boolean} True if enabled, false otherwise.
   */
  isEnabled(node:number): boolean

  /**
   * Enables or disables a node.
   * @param enabled True to enable, False to disable.
   * @param node The node to change.
   */
  setEnabled(enabled:boolean, node:number): void

  /**
   * Tells wether a link exists from a member to another.
   * @param from The emitting node.
   * @param to The receiving node.
   * @returns {boolean}
   */
  existsLink(from:number, to:number): boolean

  /**
   * Adds a link from a node to another.
   * @param from The emitting node.
   * @param to The receiving node.
   * @returns {boolean} True if the link was added, false otherwise (for example if it from exceeded the maximum quota).
   */
  addLink(from:number, to:number): boolean

  /**
   * Removes a link from a node to another. Returns the new number of links issued to the destination node.
   * @param from Issuer.
   * @param to Receiver.
   * @returns {number} The new number of links reaching Receiver.
   */
  removeLink(from:number, to:number): number

  /**
   * Tells wether a node is outdistanced from the WoT.
   * @param {number} node The node we want to test.
   * @param {number} d_min The minimum number of both issued and received certifications to be considered a sentry.
   * @param {number} k_max The maximum distance from the sentries to the node.
   * @param {number} x_percent The percentage of sentries to reach to not be considered outdistanced.
   * @returns {boolean} True is the node is outdistanced, false otherwise.
   */
  isOutdistanced(node:number, d_min:number, k_max:number, x_percent:number): boolean

  /**
   * Gives details about the distance of a node from the WoT.
   * @param {number} node The node we want to test.
   * @param {number} d_min The minimum number of both issued and received certifications to be considered a sentry.
   * @param {number} k_max The maximum distance from the sentries to the node.
   * @param {number} x_percent The percentage of sentries to reach to not be considered outdistanced.
   * @returns {{nbSuccess: number; nbSentries: number; nbReached: number; isOutdistanced: boolean}} The number of reached sentries, the number of sentries, the number of reached members, the distance test.
   */
  detailedDistance(node:number, d_min:number, k_max:number, x_percent:number): {
    nbSuccess: number
    nbSentries: number
    nbReached: number
    isOutdistanced: boolean
  }

  /**
   * Returns the sentries of the WoT.
   * @param {number} d_min The minimum number of both issued and received certifications to be considered a sentry.
   * @returns {number} An array of node ID (= array of integers).
   */
  getSentries(d_min:number): number[]

  /**
   * Returns the non-sentires of the WoT.
   * @param {number} d_min The minimum number of both issued and received certifications to be considered a sentry.
   * @returns {number} An array of node ID (= array of integers).
   */
  getNonSentries(d_min:number): number[]

  /**
   * Returns the non-members of the WoT.
   * @returns {number} An array of node ID (= array of integers).
   */
  getDisabled(): number[]

  /**
   * Returns the list of existing paths from a node to another, using a maximum of k_max steps.
   * @param {number} from The departure node.
   * @param {number} to The arrival node.
   * @param {number} k_max The maximum number of steps allowed for reaching the arrival node from departure node.
   * @returns {number[][]} A list of paths. Example of paths from ID 5 to ID 189 using k_max 4
   *   [0] = [5, 822, 333, 12, 189]
   *   [1] = [5, 29, 189]
   *   [2] = [5, 189]
   */
  getPaths(from:number, to:number, k_max:number): number[][]
}

export interface WoTBInterface {
  fileInstance: (filepath:string) => any
  memoryInstance: () => any
  setVerbose: (verbose:boolean) => void
}

export const WoTBObject:WoTBInterface = {

  fileInstance: (filepath:string) => wotb.newFileInstance(filepath),
  memoryInstance: () => wotb.newMemoryInstance(),
  setVerbose: wotb.setVerbose
}

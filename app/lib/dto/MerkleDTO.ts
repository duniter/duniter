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

"use strict";

const merkle = require("merkle");

export class MerkleDTO {
  private levels: any[];
  nodes: any[];
  depth: number;

  initialize(leaves: string[]) {
    const tree = merkle("sha256").sync(leaves);
    this.depth = tree.depth();
    this.nodes = tree.nodes();
    this.levels = [];
    for (let i = 0; i < tree.levels(); i++) {
      this.levels[i] = tree.level(i);
    }
    return this;
  }

  remove(leaf: string) {
    // If leaf IS present
    if (~this.levels[this.depth].indexOf(leaf)) {
      const leaves = this.leaves();
      const index = leaves.indexOf(leaf);
      if (~index) {
        // Replacement: remove previous hash
        leaves.splice(index, 1);
      }
      leaves.sort();
      this.initialize(leaves);
    }
  }

  removeMany(leaves: string[]) {
    leaves.forEach((leaf: string) => {
      // If leaf IS present
      if (~this.levels[this.depth].indexOf(leaf)) {
        const theLeaves = this.leaves();
        const index = theLeaves.indexOf(leaf);
        if (~index) {
          // Replacement: remove previous hash
          theLeaves.splice(index, 1);
        }
      }
    });
    leaves.sort();
    this.initialize(leaves);
  }

  push(leaf: string, previous: string) {
    // If leaf is not present
    if (this.levels[this.depth].indexOf(leaf) == -1) {
      const leaves = this.leaves();
      // Update or replacement ?
      if (previous && leaf != previous) {
        const index = leaves.indexOf(previous);
        if (~index) {
          // Replacement: remove previous hash
          leaves.splice(index, 1);
        }
      }
      leaves.push(leaf);
      leaves.sort();
      this.initialize(leaves);
    }
  }

  pushMany(leaves: string[]) {
    leaves.forEach((leaf) => {
      // If leaf is not present
      if (this.levels[this.depth].indexOf(leaf) == -1) {
        this.leaves().push(leaf);
      }
    });
    leaves.sort();
    this.initialize(leaves);
  }

  root() {
    return this.levels.length > 0 ? this.levels[0][0] : "";
  }

  leaves() {
    return this.levels[this.depth];
  }

  count() {
    return this.leaves().length;
  }
}

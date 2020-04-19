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

import { DBDocument } from "./DocumentDAL";

export class SandBox<T extends DBDocument> {
  maxSize: number;

  constructor(
    maxSize: number,
    public findElements: () => Promise<T[]>,
    public compareElements: (t1: T, t2: T) => number
  ) {
    this.maxSize = maxSize || 10;
  }

  async acceptNewSandBoxEntry(element: T, pubkey: string) {
    // Accept any document which has the exception pubkey (= the node pubkey)
    if (element.issuers.indexOf(pubkey) !== -1) {
      return true;
    }
    const elements = await this.findElements();
    if (elements.length < this.maxSize) {
      return true;
    }
    const lowestElement: T = elements[elements.length - 1];
    const comparison = this.compareElements(element, lowestElement);
    return comparison > 0;
  }

  async getSandboxRoom() {
    const elems = await this.findElements();
    return this.maxSize - elems.length;
  }
}

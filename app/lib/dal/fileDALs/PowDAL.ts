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

import {AbstractCFS} from "./AbstractCFS"

export class PowDAL extends AbstractCFS {

  private static POW_FILE = "pow.txt"

  constructor(rootPath:string, qioFS:any) {
    super(rootPath, qioFS)
  }

  init() {
    return this.coreFS.remove(PowDAL.POW_FILE, false).catch(() => {})
  }

  async getCurrent() {
    return await this.coreFS.read(PowDAL.POW_FILE);
  }

  async writeCurrent(current:string) {
    await this.coreFS.write(PowDAL.POW_FILE, current, false);
  }
}

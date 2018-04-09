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

import {AbstractCFS} from "./AbstractCFS";
import {FileSystem} from "../../system/directory"

const _ = require('underscore');

export class StatDAL extends AbstractCFS {

  constructor(rootPath:string, qioFS:FileSystem) {
    super(rootPath, qioFS)
  }

  init() {
    return Promise.resolve()
  }

  async loadStats() {
    try {
      return await this.coreFS.readJSON('stats.json')
    } catch (e) {
      return null;
    }
  }

  getStat(statName:string) {
    return this.loadStats().then((stats:any) => (stats && stats[statName]) || { statName: statName, blocks: [], lastParsedBlock: -1 })
  }

  async pushStats(statsToPush:any) {
    const stats = (await this.loadStats()) || {};
    _.keys(statsToPush).forEach(function(statName:string){
      if (!stats[statName]) {
        stats[statName] = { blocks: [] };
      }
      stats[statName].blocks = stats[statName].blocks.concat(statsToPush[statName].blocks);
    });
    return this.coreFS.writeJSON('stats.json', stats)
  }
}

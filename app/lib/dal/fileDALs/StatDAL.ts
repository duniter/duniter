import {AbstractCFS} from "./AbstractCFS";
import {CFSCore} from "./CFSCore";
const _ = require('underscore');

export class StatDAL extends AbstractCFS {

  constructor(rootPath:string, qioFS:any) {
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

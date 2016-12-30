/**
 * Created by cgeek on 22/08/15.
 */

const co = require('co');
const _ = require('underscore');

module.exports = StatDAL;

function StatDAL(rootPath, qioFS, parentCore, localDAL, AbstractStorage) {

  "use strict";

  const that = this;

  AbstractStorage.call(this, rootPath, qioFS, parentCore, localDAL);

  this.init = () => Promise.resolve();

  this.loadStats = () => co(function*(){
    try {
      return yield that.coreFS.readJSON('stats.json');
    } catch (e) {
      return null;
    }
  });

  this.getStat = (statName) => that.loadStats().then((stats) => (stats && stats[statName]) || { statName: statName, blocks: [], lastParsedBlock: -1 });

  this.pushStats = (statsToPush) => co(function *() {
    const stats = (yield that.loadStats()) || {};
    _.keys(statsToPush).forEach(function(statName){
      if (!stats[statName]) {
        stats[statName] = { blocks: [] };
      }
      stats[statName].blocks = stats[statName].blocks.concat(statsToPush[statName].blocks);
    });
    return that.coreFS.writeJSON('stats.json', stats);
  });
}

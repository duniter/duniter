/**
 * Created by cgeek on 22/08/15.
 */

var co = require('co');
var _ = require('underscore');

module.exports = StatDAL;

function StatDAL(rootPath, qioFS, parentCore, localDAL, AbstractStorage) {

  "use strict";

  var that = this;

  AbstractStorage.call(this, rootPath, qioFS, parentCore, localDAL);

  this.init = () => null;

  this.loadStats = () => that.coreFS.readJSON('stats.json').catch(() => {});

  this.getStat = (statName) => that.loadStats().then((stats) => (stats && stats[statName]) || { statName: statName, blocks: [], lastParsedBlock: -1 });

  this.saveStat = (stat, name) => {
    return co(function *() {
      var stats = (yield that.loadStats()) || {};
      stats[name] = stat;
      return that.coreFS.writeJSON('stats.json', stats);
    });
  };

  this.pushStats = (statsToPush) => {
    return co(function *() {
      var stats = (yield that.loadStats()) || {};
      _.keys(statsToPush).forEach(function(statName){
        if (!stats[statName]) {
          stats[statName] = { blocks: [] };
        }
        stats[statName].blocks = stats[statName].blocks.concat(statsToPush[statName].blocks);
      });
      return that.coreFS.writeJSON('stats.json', stats);
    });
  };
}
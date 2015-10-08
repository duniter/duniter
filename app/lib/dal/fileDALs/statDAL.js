/**
 * Created by cgeek on 22/08/15.
 */

var AbstractCFS = require('./AbstractCFS');
var co = require('co');

module.exports = StatDAL;

function StatDAL(rootPath, qioFS, parentCore, localDAL) {

  "use strict";

  var that = this;

  AbstractCFS.call(this, rootPath, qioFS, parentCore, localDAL);

  this.init = () => null;

  this.loadStats = () => that.coreFS.readJSON('stats.json').catch(() => {});

  this.getStat = (statName) => that.loadStats().then((stats) => (stats && stats[statName]) || { statName: statName, blocks: [], lastParsedBlock: -1 });

  this.saveStat = (stat, name) => {
    return co(function *() {
      var stats = yield that.loadStats();
      stats[name] = stat;
      return that.coreFS.writeJSON('stats.json', stats);
    });
  };
}
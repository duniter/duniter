/**
 * Created by cgeek on 22/08/15.
 */

var AbstractDAL = require('./AbstractDAL');

module.exports = StatDAL;

function StatDAL(profile) {

  "use strict";

  AbstractDAL.call(this);

  var logger = require('../../../lib/logger')(profile);
  var that = this;

  this.loadStats = function () {
    return that.read('stats.json')
      .fail(function(){
        return {};
      });
  };

  this.getStat = function(statName) {
    return that.loadStats()
      .then(function(stat){
        // Create stat if it does not exist
        return (stat && stat[statName]) || { statName: statName, blocks: [], lastParsedBlock: -1 };
      });
  };

  this.saveStat = function(stat, name) {
    return that.loadStats()
      .then(function(stats){
        stats[name] = stat;
        return that.write('stats.json', stats);
      });
  };
}
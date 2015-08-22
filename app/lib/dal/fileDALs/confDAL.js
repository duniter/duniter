/**
 * Created by cgeek on 22/08/15.
 */

var Configuration = require('../../entity/configuration');
var _       = require('underscore');

module.exports = ParametersDAL;

function ParametersDAL(profile, readFile, writeFile) {

  "use strict";

  var logger = require('../../../lib/logger')(profile);
  var that = this;

  this.getParameters = function() {
    return that.loadConf()
      .then(function(conf){
        return {
          "currency": conf.currency,
          "c": conf.c,
          "dt": conf.dt,
          "ud0": conf.ud0,
          "sigDelay": conf.sigDelay,
          "sigValidity": conf.sigValidity,
          "sigQty": conf.sigQty,
          "sigWoT": conf.sigWoT,
          "msValidity": conf.msValidity,
          "stepMax": 3, // uCoin only handles 3 step currencies for now
          "medianTimeBlocks": conf.medianTimeBlocks,
          "avgGenTime": conf.avgGenTime,
          "dtDiffEval": conf.dtDiffEval,
          "blocksRot": conf.blocksRot,
          "percentRot": conf.percentRot
        };
      });
  };

  this.loadConf = function() {
    return readFile('conf.json')
      .then(function(data){
        return _(Configuration.statics.defaultConf()).extend(data);
      })
      .fail(function(){
        // Silent error
        logger.warn('No configuration loaded');
        return {};
      });
  };

  this.saveConf = function(confToSave, done) {
    return writeFile('conf.json', confToSave)
      .then(function(){
        done && done();
      })
      .fail(function(err){
        done && done(err);
        throw err;
      });
  };
}
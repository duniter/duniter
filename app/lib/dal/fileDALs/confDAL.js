/**
 * Created by cgeek on 22/08/15.
 */

var AbstractDAL = require('./AbstractDAL');
var Configuration = require('../../entity/configuration');
var _       = require('underscore');

module.exports = ParametersDAL;

function ParametersDAL(dal) {

  "use strict";

  AbstractDAL.call(this, dal);
  var logger = require('../../../lib/logger')(dal.profile);
  var that = this;

  this.getParameters = function() {
    return that.loadConf()
      .then(function(conf){
        return {
          "currency": conf.currency,
          "c": parseFloat(conf.c),
          "dt": parseInt(conf.dt,10),
          "ud0": parseInt(conf.ud0,10),
          "sigDelay": parseInt(conf.sigDelay,10),
          "sigValidity": parseInt(conf.sigValidity,10),
          "sigQty": parseInt(conf.sigQty,10),
          "sigWoT": parseInt(conf.sigWoT,10),
          "msValidity": parseInt(conf.msValidity,10),
          "stepMax": parseInt(3,10), // uCoin only handles 3 step currencies for now
          "medianTimeBlocks": parseInt(conf.medianTimeBlocks,10),
          "avgGenTime": parseInt(conf.avgGenTime,10),
          "dtDiffEval": parseInt(conf.dtDiffEval,10),
          "blocksRot": parseInt(conf.blocksRot,10),
          "percentRot": parseFloat(conf.percentRot)
        };
      });
  };

  this.loadConf = function() {
    return that.read('conf.json')
      .then(function(data){
        return _(Configuration.statics.defaultConf()).extend(data);
      })
      .catch(function(){
        // Silent error
        logger.warn('No configuration loaded');
        return {};
      });
  };

  this.saveConf = function(confToSave, done) {
    return that.write('conf.json', confToSave, that.DEEP_WRITE)
      .then(function(){
        done && done();
      })
      .catch(function(err){
        done && done(err);
        throw err;
      });
  };
}
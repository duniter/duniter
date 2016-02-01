/**
 * Created by cgeek on 22/08/15.
 */

var Configuration = require('../../entity/configuration');
var co = require('co');
var _ = require('underscore');

module.exports = ConfDAL;

function ConfDAL(rootPath, qioFS, parentCore, localDAL, AbstractStorage) {

  "use strict";

  var that = this;

  AbstractStorage.call(this, rootPath, qioFS, parentCore, localDAL);

  var logger = require('../../../lib/logger')(this.dal.profile);

  this.init = () => null;

  this.getParameters = function() {
    return co(function *() {
      var conf = yield that.loadConf();
      return {
        "currency": conf.currency,
        "c": parseFloat(conf.c),
        "dt": parseInt(conf.dt,10),
        "ud0": parseInt(conf.ud0,10),
        "sigDelay": parseInt(conf.sigDelay,10),
        "sigPeriod": parseInt(conf.sigPeriod,10),
        "sigStock": parseInt(conf.sigPeriod,10),
        "sigValidity": parseInt(conf.sigValidity,10),
        "sigQty": parseInt(conf.sigQty,10),
        "xpercent": parseFloat(conf.xpercent,10),
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
    return co(function *() {
      var data = yield that.coreFS.readJSON('conf.json');
      if (data) {
        return _(Configuration.statics.defaultConf()).extend(data);
      } else {
        // Silent error
        logger.warn('No configuration loaded');
        return {};
      }
    });
  };

  this.saveConf = (confToSave) => that.coreFS.writeJSONDeep('conf.json', confToSave);
}
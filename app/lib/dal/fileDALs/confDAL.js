/**
 * Created by cgeek on 22/08/15.
 */

const Configuration = require('../../entity/configuration');
const co = require('co');
const _ = require('underscore');

module.exports = ConfDAL;

function ConfDAL(rootPath, qioFS, parentCore, localDAL, AbstractStorage) {

  "use strict";

  const that = this;

  AbstractStorage.call(this, rootPath, qioFS, parentCore, localDAL);

  const logger = require('../../logger')(this.dal.profile);

  this.init = () => Promise.resolve();

  this.getParameters = () => co(function *() {
    const conf = yield that.loadConf();
    return {
      "currency": conf.currency,
      "c": parseFloat(conf.c),
      "dt": parseInt(conf.dt,10),
      "ud0": parseInt(conf.ud0,10),
      "sigPeriod": parseInt(conf.sigPeriod,10),
      "sigStock": parseInt(conf.sigStock,10),
      "sigWindow": parseInt(conf.sigWindow,10),
      "sigValidity": parseInt(conf.sigValidity,10),
      "sigQty": parseInt(conf.sigQty,10),
      "idtyWindow": parseInt(conf.idtyWindow,10),
      "msWindow": parseInt(conf.msWindow,10),
      "xpercent": parseFloat(conf.xpercent,10),
      "msValidity": parseInt(conf.msValidity,10),
      "stepMax": parseInt(conf.stepMax,10),
      "medianTimeBlocks": parseInt(conf.medianTimeBlocks,10),
      "avgGenTime": parseInt(conf.avgGenTime,10),
      "dtDiffEval": parseInt(conf.dtDiffEval,10),
      "blocksRot": parseInt(conf.blocksRot,10),
      "percentRot": parseFloat(conf.percentRot)
    };
  });

  this.loadConf = () => co(function *() {
    const data = yield that.coreFS.readJSON('conf.json');
    if (data) {
      return _(Configuration.statics.defaultConf()).extend(data);
    } else {
      // Silent error
      logger.warn('No configuration loaded');
      return {};
    }
  });

  this.saveConf = (confToSave) => that.coreFS.writeJSONDeep('conf.json', confToSave);
}

import {CFSCore} from "./CFSCore";
import {AbstractCFS} from "./AbstractCFS";
import {ConfDTO} from "../../dto/ConfDTO";

const Configuration = require('../../entity/configuration');
const _ = require('underscore');

export class ConfDAL extends AbstractCFS {

  private logger:any

  constructor(rootPath:string, qioFS:any) {
    super(rootPath, qioFS)
    this.logger = require('../../logger').NewLogger()
  }

  init() {
    return Promise.resolve()
  }

  async getParameters() {
    const conf = await this.loadConf()
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
      "xpercent": parseFloat(conf.xpercent),
      "msValidity": parseInt(conf.msValidity,10),
      "stepMax": parseInt(conf.stepMax,10),
      "medianTimeBlocks": parseInt(conf.medianTimeBlocks,10),
      "avgGenTime": parseInt(conf.avgGenTime,10),
      "dtDiffEval": parseInt(conf.dtDiffEval,10),
      "percentRot": parseFloat(conf.percentRot),
      "udTime0": parseInt(conf.udTime0),
      "udReevalTime0": parseInt(conf.udReevalTime0),
      "dtReeval": parseInt(conf.dtReeval)
    }
  }

  async loadConf() {
    const data = await this.coreFS.readJSON('conf.json');
    if (data) {
      return _(Configuration.statics.defaultConf()).extend(data);
    } else {
      // Silent error
      this.logger.warn('No configuration loaded');
      return {};
    }
  }

  async saveConf(confToSave:ConfDTO) {
    await this.coreFS.writeJSONDeep('conf.json', confToSave)
  }
}

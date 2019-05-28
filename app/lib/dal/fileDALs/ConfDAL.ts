// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import {AbstractCFS} from "./AbstractCFS"
import {ConfDTO} from "../../dto/ConfDTO"
import {CommonConstants} from "../../common-libs/constants";
import {FileSystem} from "../../system/directory"
import {Underscore} from "../../common-libs/underscore"
import {ConfDAO} from "../indexDAL/abstract/ConfDAO"

export class ConfDAL extends AbstractCFS implements ConfDAO {

  private logger:any

  constructor(rootPath:string, qioFS:FileSystem) {
    super(rootPath, qioFS)
    this.logger = require('../../logger').NewLogger()
  }

  async init() {
  }

  async close() {
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
      "sigReplay": parseInt(conf.sigReplay,10),
      "idtyWindow": parseInt(conf.idtyWindow,10),
      "msWindow": parseInt(conf.msWindow,10),
      "msPeriod": parseInt(conf.msPeriod,10),
      "xpercent": parseFloat(conf.xpercent),
      "msValidity": parseInt(conf.msValidity,10),
      "stepMax": parseInt(conf.stepMax,10),
      "medianTimeBlocks": parseInt(conf.medianTimeBlocks,10),
      "avgGenTime": parseInt(conf.avgGenTime,10),
      "dtDiffEval": parseInt(conf.dtDiffEval,10),
      "percentRot": parseFloat(conf.percentRot),
      "udTime0": parseInt(conf.udTime0),
      "udReevalTime0": parseInt(conf.udReevalTime0),
      "dtReeval": parseInt(conf.dtReeval),
      "switchOnHeadAdvance": CommonConstants.SWITCH_ON_BRANCH_AHEAD_BY_X_BLOCKS
    }
  }

  async readRawConfFile() {
    return this.coreFS.read('conf.json')
  }

  async loadConf() {
    const data = await this.coreFS.readJSON('conf.json');
    if (data) {
      return Underscore.extend(ConfDTO.defaultConf(), data)
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

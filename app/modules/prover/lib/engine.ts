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

import {Master as PowCluster} from "./powCluster"
import {ConfDTO} from "../../../lib/dto/ConfDTO"
import {FileDAL} from "../../../lib/dal/fileDAL"
import {ProofAsk} from "./blockProver"

const os         = require('os')

// Super important for Node.js debugging
const debug = process.execArgv.toString().indexOf('--debug') !== -1;
if(debug) {
  //Set an unused port number.
  process.execArgv = [];
}

export class PowEngine {

  private nbWorkers:number
  private cluster:PowCluster
  readonly id:number

  constructor(private conf:ConfDTO, logger:any, private dal?:FileDAL) {

    // We use as much cores as available, but not more than CORES_MAXIMUM_USE_IN_PARALLEL
    this.nbWorkers = conf.nbCores
    this.cluster = new PowCluster(this.nbWorkers, logger, dal)
    this.id = this.cluster.clusterId
  }

  getNbWorkers() {
    return this.cluster.nbWorkers
  }

  forceInit() {
    return this.cluster.initCluster()
  }

  async prove(stuff: ProofAsk) {
    await this.cluster.cancelWork()
    return await this.cluster.proveByWorkers(stuff)
  }

  cancel() {
    return this.cluster.cancelWork()
  }

  setConf(value:any) {
    return this.cluster.changeConf(value)
  }

  setOnInfoMessage(callback:any) {
    return this.cluster.onInfoMessage = callback
  }

  async shutDown() {
    return this.cluster.shutDownWorkers()
  }
}

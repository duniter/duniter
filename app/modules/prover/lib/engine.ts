import {Master as PowCluster} from "./powCluster"
import {ConfDTO} from "../../../lib/dto/ConfDTO"

const os         = require('os')

// Super important for Node.js debugging
const debug = process.execArgv.toString().indexOf('--debug') !== -1;
if(debug) {
  //Set an unused port number.
  process.execArgv = [];
}

export class PowEngine {

  private cluster:PowCluster
  readonly id:number

  constructor(private conf:ConfDTO, logger:any) {
    // We use as much cores as available, but not more than CORES_MAXIMUM_USE_IN_PARALLEL
    this.cluster = new PowCluster(conf.nbCores, logger)
    this.id = this.cluster.clusterId
  }

  getNbWorkers() {
    return this.cluster.nbWorkers
  }

  forceInit() {
    return this.cluster.initCluster()
  }

  async prove(stuff:any) {
    await this.cluster.cancelWork()
    return await this.cluster.proveByWorkers(stuff)
  }

  cancel() {
    return this.cluster.cancelWork()
  }

  reduceNbCores() {
    return this.cluster.removeSlave()
  }

  boostCPU() {
    return this.cluster.boostCPU()
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

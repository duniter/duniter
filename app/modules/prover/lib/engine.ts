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

  private nbWorkers:number
  private cluster:PowCluster
  readonly id:number

  constructor(private conf:ConfDTO, logger:any) {

    // We use as much cores as available, but not more than CORES_MAXIMUM_USE_IN_PARALLEL
    this.nbWorkers = conf.nbCores
    this.cluster = new PowCluster(this.nbWorkers, logger)
    this.id = this.cluster.clusterId
  }

  getNbWorkers() {
    return this.cluster.nbWorkers
  }

  forceInit() {
    return this.cluster.initCluster()
  }

  async prove(stuff:any) {
    if (this.cluster.hasProofPending) {
      await this.cluster.cancelWork()
    }
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

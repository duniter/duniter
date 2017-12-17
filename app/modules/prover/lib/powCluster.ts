import {ConfDTO} from "../../../lib/dto/ConfDTO"
import {ProverConstants} from "./constants"

const _ = require('underscore')
const nuuid = require('node-uuid');
const cluster = require('cluster')
const querablep = require('querablep')

let clusterId = 0
cluster.setMaxListeners(3)

/**
 * Cluster controller, handles the messages between the main program and the PoW cluster.
 */
export class Master {

  nbCancels = 0

  clusterId:number
  currentPromise:any|null = null
  slaves:any[] = []
  slavesMap:any = {}
  conf:any = {}
  logger:any
  onInfoCallback:any
  workersOnline:Promise<any>[]
  private exitHandler: (worker: any, code: any, signal: any) => void
  private onlineHandler: (worker: any) => void
  private messageHandler: (worker: any, msg: any) => void

  constructor(private nbCores:number, logger:any) {
    this.clusterId = clusterId++
    this.logger = logger || Master.defaultLogger()
    this.onInfoMessage = (message:any) => {
      this.logger.info(`${message.pow.pow} nonce = ${message.pow.block.nonce}`)
    }

    this.exitHandler = (worker:any, code:any, signal:any) => {
      this.logger.info(`worker ${worker.process.pid} died with code ${code} and signal ${signal}`)
    }

    this.onlineHandler = (worker:any) => {
      // We just listen to the workers of this Master
      if (this.slavesMap[worker.id]) {
        this.logger.info(`[online] worker c#${this.clusterId}#w#${worker.id}`)
        this.slavesMap[worker.id].online.extras.resolve()
        worker.send({
          command: 'conf',
          value: this.conf
        })
      }
    }

    this.messageHandler = (worker:any, msg:any) => {
      // Message for this cluster
      if (this.slavesMap[worker.id]) {
        this.onWorkerMessage(worker, msg)
      }
    }
  }

  get nbWorkers() {
    return this.slaves.length
  }

  get hasProofPending() {
    return !!this.currentPromise
  }

  set onInfoMessage(callback:any) {
    this.onInfoCallback = callback
  }

  onWorkerMessage(worker:any, message:any) {
    // this.logger.info(`worker#${this.slavesMap[worker.id].index} sent message:${message}`)
    if (message.pow && message.pow.pow) {
      this.onInfoCallback && this.onInfoCallback(message)
    }
    if (this.currentPromise && message.uuid === this.currentPromise.extras.uuid && !this.currentPromise.isResolved() && message.answer) {
      this.logger.info(`ENGINE c#${this.clusterId}#${this.slavesMap[worker.id].index} HAS FOUND A PROOF #${message.answer.pow.pow}`)
      this.currentPromise.extras.resolve(message.answer)
      // Stop the slaves' current work
      this.cancelWork()
    } else if (message.canceled) {
      this.nbCancels++
    }
    // this.logger.debug(`ENGINE c#${this.clusterId}#${this.slavesMap[worker.id].index}:`, message)
  }

  /*****************
   * CLUSTER METHODS
   ****************/

  initCluster() {
    // Setup master
    cluster.setupMaster({
      exec: __filename
    })

    this.slaves = Array.from({ length: this.nbCores }).map((value, index) => {
      const worker = cluster.fork()
      this.logger.info(`Creating worker c#${this.clusterId}#w#${worker.id}`)
      this.slavesMap[worker.id] = {

        // The Node.js worker
        worker,

        // Inner identifier
        index,

        // Worker ready
        online: (function onlinePromise() {
          let resolve
          const p = querablep(new Promise(res => resolve = res))
          p.extras = { resolve }
          return p
        })(),

        // Each worker has his own chunk of possible nonces
        nonceBeginning: this.nbCores === 1 ? 0 : (index + 1) * ProverConstants.NONCE_RANGE
      }
      return this.slavesMap[worker.id]
    })

    cluster.on('exit', this.exitHandler)
    cluster.on('online', this.onlineHandler)
    cluster.on('message', this.messageHandler)

    this.workersOnline = this.slaves.map((s:any) => s.online)
    return Promise.all(this.workersOnline)
  }

  changeConf(conf:ConfDTO) {
    this.logger.info(`Changing conf to: ${JSON.stringify(conf)} on PoW cluster`)
    this.conf.cpu = conf.cpu || this.conf.cpu
    this.conf.prefix = this.conf.prefix || conf.prefix
    this.slaves.forEach(s => {
      s.worker.send({
        command: 'conf',
        value: this.conf
      })
    })
    return Promise.resolve(_.clone(conf))
  }

  cancelWork() {
    this.logger.info(`Cancelling the work on PoW cluster of %s slaves`, this.slaves.length)
    this.slaves.forEach(s => {
      s.worker.send({
        command: 'cancel'
      })
    })

    // Eventually force the end of current promise
    if (this.currentPromise && !this.currentPromise.isFulfilled()) {
      this.currentPromise.extras.resolve(null)
    }

    // Current promise is done
    this.currentPromise = null

    return Promise.resolve()
  }

  newPromise(uuid:string) {
    let resolve
    const p = querablep(new Promise(res => resolve = res))
    p.extras = { resolve, uuid }
    return p
  }

  async shutDownWorkers() {
    if (this.workersOnline) {
      await Promise.all(this.workersOnline)
      await Promise.all(this.slaves.map(async (s:any) => {
        s.worker.kill()
      }))
      cluster.removeListener('exit', this.exitHandler)
      cluster.removeListener('online', this.onlineHandler)
      cluster.removeListener('message', this.messageHandler)
    }
    this.slaves = []
  }

  proveByWorkers(stuff:any) {

    // Eventually spawn the workers
    if (this.slaves.length === 0) {
      this.initCluster()
    }

    // Register the new proof uuid
    const uuid = nuuid.v4()
    this.currentPromise = this.newPromise(uuid)

    return (async () => {
      await Promise.all(this.workersOnline)

      if (!this.currentPromise) {
        this.logger.info(`Proof canceled during workers' initialization`)
        return null
      }

      // Start the salves' job
      this.slaves.forEach((s:any, index) => {
        s.worker.send({
          uuid,
          command: 'newPoW',
          value: {
            initialTestsPerRound: stuff.initialTestsPerRound,
            maxDuration: stuff.maxDuration,block: stuff.newPoW.block,
            nonceBeginning: s.nonceBeginning,
            zeros: stuff.newPoW.zeros,
            highMark: stuff.newPoW.highMark,
            pair: _.clone(stuff.newPoW.pair),
            forcedTime: stuff.newPoW.forcedTime,
            conf: {
              medianTimeBlocks: stuff.newPoW.conf.medianTimeBlocks,
              avgGenTime: stuff.newPoW.conf.avgGenTime,
              cpu: stuff.newPoW.conf.cpu,
              prefix: stuff.newPoW.conf.prefix
            }
          }
        })
      })

      return await this.currentPromise
    })()
  }

  static defaultLogger() {
    return {
      info: (message:any) => {}
    }
  }
}

if (cluster.isMaster) {

  // Super important for Node.js debugging
  const debug = process.execArgv.toString().indexOf('--debug') !== -1;
  if(debug) {
    //Set an unused port number.
    process.execArgv = [];
  }

} else {

  process.on("SIGTERM", function() {
    process.exit(0)
  });

  require('./proof')
}

import {ConfDTO} from "../../../lib/dto/ConfDTO"
import {ProverConstants} from "./constants"
import {createPowWorker} from "./proof"
import {PowWorker} from "./PowWorker"
import {FileDAL} from "../../../lib/dal/fileDAL";

const _ = require('underscore')
const nuuid = require('node-uuid');
const cluster = require('cluster')
const querablep = require('querablep')

let clusterId = 0
cluster.setMaxListeners(3)

export interface SlaveWorker {
  worker:PowWorker,
  index:number,
  online:Promise<void>,
  nonceBeginning:number
}

/**
 * Cluster controller, handles the messages between the main program and the PoW cluster.
 */
export class Master {

  nbCancels = 0

  clusterId:number
  currentPromise:any|null = null
  slaves:SlaveWorker[] = []
  slavesMap:{
    [k:number]: SlaveWorker|null
  } = {}
  conf:any = {}
  logger:any
  onInfoCallback:any
  workersOnline:Promise<any>[]

  constructor(private nbCores:number, logger:any, private dal?:FileDAL) {
    this.clusterId = clusterId++
    this.logger = logger || Master.defaultLogger()
    this.onInfoMessage = (message:any) => {
      this.logger.info(`${message.pow.pow} nonce = ${message.pow.block.nonce}`)
    }
  }

  get nbWorkers() {
    return this.slaves.length
  }

  set onInfoMessage(callback:any) {
    this.onInfoCallback = callback
  }

  onWorkerMessage(workerIndex:number, message:any) {
    // this.logger.info(`worker#${this.slavesMap[worker.id].index} sent message:${message}`)
    if (message && message.pow) {
      this.onInfoCallback && this.onInfoCallback(message)
    }
    if (this.currentPromise && message.uuid && !this.currentPromise.isResolved() && message.answer) {
      this.logger.info(`ENGINE c#${this.clusterId}#${workerIndex} HAS FOUND A PROOF #${message.answer.pow.pow}`)
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
      exec: __filename,
      execArgv: [] // Do not try to debug forks
    })

    this.slaves = Array.from({ length: this.nbCores }).map((value, index) => {
      const nodejsWorker = cluster.fork()
      const worker = new PowWorker(nodejsWorker, message => {
        this.onWorkerMessage(index, message)
      }, () => {
        this.logger.info(`[online] worker c#${this.clusterId}#w#${index}`)
        worker.sendConf({
          rootPath: this.dal ? this.dal.rootPath : '',
          command: 'conf',
          value: this.conf
        })
      }, (code:any, signal:any) => {
        this.logger.info(`worker ${worker.pid} died with code ${code} and signal ${signal}`)
      })

      this.logger.info(`Creating worker c#${this.clusterId}#w#${nodejsWorker.id}`)
      const slave = {

        // The Node.js worker
        worker,

        // Inner identifier
        index,

        // Worker ready
        online: worker.online,

        // Each worker has his own chunk of possible nonces
        nonceBeginning: this.nbCores === 1 ? 0 : (index + 1) * ProverConstants.NONCE_RANGE
      }
      this.slavesMap[nodejsWorker.id] = slave
      return slave
    })

    this.workersOnline = this.slaves.map((s) => s.online)
    return Promise.all(this.workersOnline)
  }

  changeConf(conf:ConfDTO) {
    this.logger.info(`Changing conf to: ${JSON.stringify(conf)} on PoW cluster`)
    this.conf.cpu = conf.cpu || this.conf.cpu
    this.conf.prefix = this.conf.prefix || conf.prefix
    this.slaves.forEach(s => {
      s.worker.sendConf({
        rootPath: '',
        command: 'conf',
        value: this.conf
      })
    })
    return Promise.resolve(_.clone(conf))
  }

  private cancelWorkersWork() {
    this.slaves.forEach(s => {
      s.worker.sendCancel()
    })
    if (this.dal) {
      this.dal.powDAL.writeCurrent("")
    }
  }

  async cancelWork() {
    const workEnded = this.currentPromise
    // Don't await the cancellation!
    this.cancelWorkersWork()
    // Current promise is done
    this.currentPromise = null
    return await workEnded
  }

  async shutDownWorkers() {
    if (this.workersOnline) {
      await Promise.all(this.workersOnline)
      await Promise.all(this.slaves.map(async (s) => {
        s.worker.kill()
      }))
    }
    this.slaves = []
  }

  async proveByWorkers(stuff:any) {

    // Eventually spawn the workers
    if (this.slaves.length === 0) {
      this.initCluster()
    }

    if (this.dal) {
      await this.dal.powDAL.writeCurrent([stuff.newPoW.block.number - 1, stuff.newPoW.block.previousHash].join('-'))
    }

    // Register the new proof uuid
    const uuid = nuuid.v4()
    this.currentPromise = querablep((async () => {
      await Promise.all(this.workersOnline)

      if (!this.currentPromise) {
        this.logger.info(`Proof canceled during workers' initialization`)
        return null
      }

      // Start the salves' job
      const asks = this.slaves.map(async (s, index) => {
        const proof = await s.worker.askProof({
          uuid,
          command: 'newPoW',
          value: {
            rootPath: this.dal ? this.dal.rootPath : '',
            initialTestsPerRound: stuff.initialTestsPerRound,
            maxDuration: stuff.maxDuration,
            block: stuff.newPoW.block,
            nonceBeginning: s.nonceBeginning,
            zeros: stuff.newPoW.zeros,
            highMark: stuff.newPoW.highMark,
            pair: _.clone(stuff.newPoW.pair),
            forcedTime: stuff.newPoW.forcedTime,
            conf: {
              powNoSecurity: stuff.newPoW.conf.powNoSecurity,
              medianTimeBlocks: stuff.newPoW.conf.medianTimeBlocks,
              avgGenTime: stuff.newPoW.conf.avgGenTime,
              cpu: stuff.newPoW.conf.cpu,
              prefix: stuff.newPoW.conf.prefix
            }
          }
        })
        this.logger.info(`[done] worker c#${this.clusterId}#w#${index}`)
        return {
          workerID: index,
          proof
        }
      })

      // Find a proof
      const result = await Promise.race(asks)
      // Don't await the cancellation!
      this.cancelWorkersWork()
      // Wait for all workers to have stopped looking for a proof
      await Promise.all(asks)

      if (!result.proof || !result.proof.message.answer) {
        this.logger.info('No engine found the proof. It was probably cancelled.')
        return null
      } else {
        this.logger.info(`ENGINE c#${this.clusterId}#${result.workerID} HAS FOUND A PROOF #${result.proof.message.answer.pow.pow}`)
        return result.proof.message.answer
      }
    })())

    return this.currentPromise
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

  createPowWorker()
}

"use strict";

const co = require('co');
const _ = require('underscore')
const nuuid = require('node-uuid');
const moment = require('moment');
const cluster = require('cluster')
const querablep = require('querablep')
const constants = require('./constants')

let clusterId = 0

if (cluster.isMaster) {

  // Super important for Node.js debugging
  const debug = process.execArgv.toString().indexOf('--debug') !== -1;
  if(debug) {
    //Set an unused port number.
    process.execArgv = [];
  }

  /**
   * Cluster controller, handles the messages between the main program and the PoW cluster.
   */
  class Master {

    constructor(nbCores, logger) {
      this.clusterId = clusterId++
      this.nbCores = nbCores
      this.logger = logger || Master.defaultLogger()
      this.currentPromise = null
      this.slaves = []
      this.slavesMap = {}
      this.conf = {}
      this.onInfoMessage = (message) => {
        this.logger.info(`${message.pow.pow} nonce = ${message.pow.block.nonce}`)
      }
    }

    get nbWorkers() {
      return this.slaves.length
    }

    get hasProofPending() {
      return !!this.currentPromise
    }

    set onInfoMessage(callback) {
      this.onInfoCallback = callback
    }

    onWorkerMessage(worker, message) {
      // this.logger.info(`worker#${this.slavesMap[worker.id].index} sent message:${message}`)
      if (message.pow && message.pow.pow) {
        this.onInfoCallback && this.onInfoCallback(message)
      }
      if (this.currentPromise && message.uuid === this.currentPromise.extras.uuid && !this.currentPromise.isResolved() && message.answer) {
        this.logger.info(`ENGINE c#${this.clusterId}#${this.slavesMap[worker.id].index} HAS FOUND A PROOF #${message.answer.pow.pow}`)
        this.currentPromise.extras.resolve(message.answer)
        // Stop the slaves' current work
        this.cancelWork()
      }
      this.logger.debug(`ENGINE c#${this.clusterId}#${this.slavesMap[worker.id].index}:`, message)
    }

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
          nonceBeginning: this.nbCores === 1 ? 0 : (index + 1) * constants.NONCE_RANGE
        }
        return this.slavesMap[worker.id]
      })

      cluster.on('exit', (worker, code, signal) => {
        this.logger.info(`worker ${worker.process.pid} died with code ${code} and signal ${signal}`)
      })

      cluster.on('online', (worker) => {
        // We just listen to the workers of this Master
        if (this.slavesMap[worker.id]) {
          this.logger.info(`[online] worker c#${this.clusterId}#w#${worker.id}`)
          this.slavesMap[worker.id].online.extras.resolve()
          worker.send({
            command: 'conf',
            value: this.conf
          })
        }
      })

      cluster.on('message', (worker, msg) => {
        // Message for this cluster
        if (this.slavesMap[worker.id]) {
          this.onWorkerMessage(worker, msg)
        }
      })

      this.workersOnline = this.slaves.map(s => s.online)
      return this.workersOnline
    }

    changeConf(conf) {
      this.logger.info(`Changing conf to: ${JSON.stringify(conf)} on PoW cluster`)
      this.conf.cpu = this.conf.cpu || conf.cpu
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
      this.logger.info(`Cancelling the work on PoW cluster`)
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

    newPromise(uuid) {
      let resolve
      const p = querablep(new Promise(res => resolve = res))
      p.extras = { resolve, uuid }
      return p
    }

    proveByWorkers(stuff) {

      // Eventually spawn the workers
      if (this.slaves.length === 0) {
        this.initCluster()
      }

      // Register the new proof uuid
      const uuid = nuuid.v4()
      this.currentPromise = this.newPromise(uuid)

      const that = this

      return co(function*() {
        yield that.workersOnline

        if (!that.currentPromise) {
          that.logger.info(`Proof canceled during workers' initialization`)
          return null
        }

        // Start the salves' job
        that.slaves.forEach(s => {
          s.worker.send({
            uuid,
            command: 'newPoW',
            value: {
              block: stuff.newPoW.block,
              nonceBeginning: s.nonceBeginning,
              zeros: stuff.newPoW.zeros,
              highMark: stuff.newPoW.highMark,
              pair: _.clone(stuff.newPoW.pair),
              forcedTime: stuff.newPoW.forcedTime,
              turnDuration: stuff.newPoW.turnDuration,
              conf: {
                medianTimeBlocks: stuff.newPoW.conf.medianTimeBlocks,
                avgGenTime: stuff.newPoW.conf.avgGenTime,
                cpu: stuff.newPoW.conf.cpu,
                prefix: stuff.newPoW.conf.prefix
              }
            }
          })
        })

        let res = yield that.currentPromise
        return res
      })
    }

    static defaultLogger() {
      return {
        info: (message) => {}
      }
    }
  }

  module.exports = (nbCores, logger) => new Master(nbCores, logger)

} else {

  process.on("SIGTERM", function() {
    console.log(`SIGTERM received, closing worker ${process.pid}`);
    process.exit(0)
  });

  require('./proof')
}


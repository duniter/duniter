"use strict";

const os         = require('os')
const co         = require('co')
const querablep  = require('querablep')
const powCluster = require('./powCluster')
const constants  = require('./constants')

module.exports = function (conf, logger) {
  return new PowEngine(conf, logger);
};

function PowEngine(conf, logger) {

  // Super important for Node.js debugging
  const debug = process.execArgv.toString().indexOf('--debug') !== -1;
  if(debug) {
    //Set an unused port number.
    process.execArgv = [];
  }

  const nbWorkers = (conf && conf.nbCores) || Math.min(constants.CORES_MAXIMUM_USE_IN_PARALLEL, require('os').cpus().length)
  const cluster = powCluster(nbWorkers, logger)

  this.forceInit = () => cluster.initCluster()

  this.id = cluster.clusterId

  this.prove = (stuff) => co(function*() {

    if (cluster.hasProofPending) {
      yield cluster.cancelWork()
    }

    if (os.arch().match(/arm/)) {
      stuff.conf.cpu /= 2; // Don't know exactly why is ARM so much saturated by PoW, so let's divide by 2
    }
    let res = yield cluster.proveByWorkers(stuff)
    return res
  })

  this.cancel = () => cluster.cancelWork()

  this.setConf = (value) => cluster.changeConf(value)

  this.setOnInfoMessage = (callback) => cluster.onInfoMessage = callback
}

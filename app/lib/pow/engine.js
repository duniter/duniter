"use strict";

const childProcess = require('child_process');
const path = require('path');
const co = require('co');
const os = require('os');
const nuuid = require('node-uuid');
const querablep = require('../querablep');

module.exports = function (opts) {
  return new PowEngine(opts);
};

function PowEngine() {

  // Super important for Node.js debugging
  const debug = process.execArgv.toString().indexOf('--debug') !== -1;
  if(debug) {
    //Set an unused port number.
    process.execArgv = [];
  }

  const logger = require('../logger')('engine');
  let powProcess;
  let onInfoMessage;

  const exchanges = {};

  const restart = () => co(function*(){
    if (!powProcess || !powProcess.connected) {
      powProcess = childProcess.fork(path.join(__dirname, '.', 'proof.js'));

      powProcess.on('message', function(msg) {
        if (!msg.uuid) {
          if (onInfoMessage) {
            onInfoMessage(msg);
          }
        } else if (!exchanges[msg.uuid]) {
          logger.error('PoW engine has sent a message about an unknown uuid:');
          logger.debug(msg);
        } else if (exchanges[msg.uuid].isFulfilled()) {
          logger.error('PoW engine has sent a message about an already fulfilled uuid:');
          logger.debug(msg);
        } else {
          exchanges[msg.uuid].extras.resolve(msg.answer);
        }
      });

      powProcess.on('exit', function() {
        logger.warn('PoW engine has exited.');
      });
    }
  });

  const ask = (command, value) => co(function*(){
    // Restart the engine as it regularly closes itself if not used (free memory + cpu)
    yield restart();
    const uuid = nuuid.v4();
    let resolve, reject;
    exchanges[uuid] = querablep(new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    }));
    exchanges[uuid].extras = { resolve, reject };
    // Send the message
    powProcess.send({ command, uuid, value });
    // Wait for the answer
    return exchanges[uuid];
  });

  this.prove = (block, nonceBeginning, zeros, highMark, pair, forcedTime, medianTimeBlocks, avgGenTime, cpu) => {
    if (os.arch().match(/arm/)) {
      cpu /= 2; // Don't know exactly why is ARM so much saturated by PoW, so let's divide by 2
    }
    return ask('newPoW', { block, nonceBeginning, zeros, highMark, pair, forcedTime, conf: { medianTimeBlocks, avgGenTime, cpu } });
  };

  this.status = () => ask('state');

  this.cancel = () => ask('cancel');

  this.getValue = (key) => ask(key);

  this.setValue = (key, value) => ask(key, value);

  this.isConnected = () => powProcess ? powProcess.connected : false;

  this.setOnInfoMessage = (callback) => onInfoMessage = callback;
}
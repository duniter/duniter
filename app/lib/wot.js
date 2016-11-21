"use strict";

const wotb = require('wotb');
const logger = require('./logger')('wot');

module.exports = {

  fileInstance: (filepath) => new WoTBWrapper(wotb.newFileInstance(filepath)),
  memoryInstance: () => new WoTBWrapper(wotb.newMemoryInstance()),
  setVerbose: wotb.setVerbose
};

function WoTBWrapper(instance) {

  this.setVerbose = wotb.setVerbose;
  this.resetWoT = instance.resetWoT;
  this.showWoT = instance.showWoT;
  this.showGraph = () =>
    instance.showGraph();
  this.getWoTSize = instance.getWoTSize;
  this.isEnabled = instance.isEnabled;
  this.existsLink = instance.existsLink;
  this.isOutdistanced = instance.isOutdistanced;
  this.setMaxCert = instance.setMaxCert;
  this.getPaths = instance.getPaths;
  this.getSentries = instance.getSentries;
  this.getNonSentries = instance.getNonSentries;

  this.setEnabled = (enabled, nodeID) => instance.setEnabled(enabled, nodeID);

  this.addNode = () => {
    let nodeNumber = instance.addNode();
    logger.trace('New node#%s', nodeNumber);
    return nodeNumber;
  };

  this.removeNode = () => {
    let remains = instance.removeNode();
    logger.trace('Removed node#%s', remains + 1);
    return remains;
  };

  this.addLink = (from, to) => {
    logger.trace('Link %s -> %s', from, to);
    instance.addLink(from, to);
  };

  this.removeLink = (from, to, debug) => {
    logger.trace('Link %s X> %s', from, to);
    instance.removeLink(from, to);
  };
}

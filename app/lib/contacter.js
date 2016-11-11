"use strict";

const co = require('co');
const rp = require('request-promise');
const constants = require('./constants');
const sanitize = require('./streams/sanitize');
const dtos = require('./streams/dtos');

/**
 * Created by cgeek on 16/10/16.
 */

const contacter = module.exports = (host, port, opts) => new Contacter(host, port, opts);

function Contacter(host, port, opts) {

  opts = opts || {};
  const options = {
    timeout: opts.timeout || constants.NETWORK.DEFAULT_TIMEOUT
  };

  this.getSummary = () => get('/node/summary/', dtos.Summary);
  this.getLookup = (search) => get('/wot/lookup/', dtos.Lookup, search);
  this.getBlock = (number) => get('/blockchain/block/', dtos.Block, number);
  this.getCurrent = () => get('/blockchain/current', dtos.Block);
  this.getPeer = () => get('/network/peering', dtos.Peer);
  this.getPeers = (obj) => get('/network/peering/peers', dtos.MerkleOfPeers, obj);
  this.getSources = (pubkey) => get('/tx/sources/', dtos.Sources, pubkey);
  this.getBlocks = (count, fromNumber) => get('/blockchain/blocks/', dtos.Blocks, [count, fromNumber].join('/'));
  this.postPeer = (peer) => post('/network/peering/peers', dtos.Peer, { peer: peer });
  this.processTransaction = (rawTX) => post('/tx/process', dtos.Transaction, { transaction: rawTX });

  // We suppose that IPv6 is already wrapped by [], for example 'http://[::1]:80/index.html'
  const fullyQualifiedHost = [host, port].join(':');

  function get(url, dtoContract, param) {
    if (typeof param === 'object') {
      // Classical URL params (a=1&b=2&...)
      param = '?' + Object.keys(param).map((k) => [k, param[k]].join('=')).join('&');
    }
    return co(function*() {
      try {
        const json = yield rp.get({
          url: 'http://' + fullyQualifiedHost + url + (param !== undefined ? param : ''),
          json: true,
          timeout: options.timeout
        });
        // Prevent JSON injection
        return sanitize(json, dtoContract);
      } catch (e) {
        throw e.error;
      }
    });
  }

  function post(url, dtoContract, data) {
    return co(function*() {
      try {
        const json = yield rp.post({
          url: 'http://' + fullyQualifiedHost + url,
          body: data,
          json: true,
          timeout: options.timeout
        });
        // Prevent JSON injection
        return sanitize(json, dtoContract);
      } catch (e) {
        throw e.error;
      }
    });
  }
}

contacter.statics = {};

contacter.statics.quickly = (host, port, opts, callbackPromise) => co(function*() {
  const node = contacter(host, port, opts);
  return callbackPromise(node);
});

contacter.statics.fetchPeer = (host, port, opts) => contacter.statics.quickly(host, port, opts, (node) => node.getPeer());

contacter.statics.isReachableFromTheInternet = (peer, opts) => co(function*() {
  const Peer = require('./entity/peer');
  const p = Peer.statics.fromJSON(peer);
  const node = new Contacter(p.getHost(), p.getPort(), opts);
  try {
    yield node.getPeer();
    return true;
  } catch (e) {
    return false;
  }
});

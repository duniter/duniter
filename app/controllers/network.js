"use strict";
const _                = require('underscore');
const co               = require('co');
const Q                = require('q');
const http2raw         = require('../lib/helpers/http2raw');
const constants        = require('../lib/constants');
const Peer             = require('../lib/entity/peer');
const AbstractController = require('./abstract');

module.exports = function (server) {
  return new NetworkBinding(server);
};

function NetworkBinding (server) {

  AbstractController.call(this, server);

  // Services
  const MerkleService     = server.MerkleService;
  const PeeringService    = server.PeeringService;

  this.cert = PeeringService.cert;

  this.peer = () => co(function *() {
    const p = yield PeeringService.peer();
    if (!p) {
      throw constants.ERRORS.SELF_PEER_NOT_FOUND;
    }
    return p.json();
  });

  this.peersGet = (req) => co(function *() {
    let merkle = yield server.dal.merkleForPeers();
    return yield MerkleService.processForURL(req, merkle, (hashes) => {
      return co(function *() {
        try {
          let peers = yield server.dal.findPeersWhoseHashIsIn(hashes);
          const map = {};
          peers.forEach((peer) => {
            map[peer.hash] = Peer.statics.peerize(peer).json();
          });
          if (peers.length == 0) {
            throw constants.ERRORS.PEER_NOT_FOUND;
          }
          return map;
        } catch (e) {
          throw e;
        }
      });
    });
  });

  this.peersPost = (req) => this.pushEntity(req, http2raw.peer, constants.ENTITY_PEER);

  this.peers = () => co(function *() {
    let peers = yield server.dal.listAllPeers();
    return {
      peers: peers.map((p) => {
        return _.pick(p,
          'version',
          'currency',
          'status',
          'first_down',
          'last_try',
          'pubkey',
          'block',
          'signature',
          'endpoints');
      })
    };
  });
}

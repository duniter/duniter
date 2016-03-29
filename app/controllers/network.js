"use strict";
var _                = require('underscore');
var co               = require('co');
var Q                = require('q');
var async            = require('async');
var http2raw         = require('../lib/streams/parsers/http2raw');
var parsers          = require('../lib/streams/parsers/doc');
var constants        = require('../lib/constants');
var Peer             = require('../lib/entity/peer');
var AbstractController = require('./abstract');

module.exports = function (server) {
  return new NetworkBinding(server);
};

function NetworkBinding (server) {

  AbstractController.call(this, server);

  // Services
  var MerkleService     = server.MerkleService;
  var PeeringService    = server.PeeringService;

  this.cert = PeeringService.cert;

  this.peer = () => co(function *() {
    var p = yield PeeringService.peer();
    if (!p) {
      throw constants.ERRORS.SELF_PEER_NOT_FOUND;
    }
    return p.json();
  });

  this.peersGet = (req) => co(function *() {
    let merkle = yield server.dal.merkleForPeers();
    return Q.nfcall(MerkleService.processForURL, req, merkle, function (hashes, done) {
      server.dal.findPeersWhoseHashIsIn(hashes)
        .then(function(peers) {
          var map = {};
          peers.forEach(function (peer){
            map[peer.hash] = Peer.statics.peerize(peer).json();
          });
          if (peers.length == 0) {
            done(constants.ERRORS.PEER_NOT_FOUND);
          }
          done(null, map);
        })
        .catch(done);
    });
  });

  this.peersPost = (req) => this.pushEntity(req, http2raw.peer, parsers.parsePeer);

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

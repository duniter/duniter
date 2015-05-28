"use strict";
var Q       = require('q');
var stream  = require('stream');
var util    = require('util');
var request = require('request');
var async   = require('async');
var constants = require('../../lib/constants');
var Peer    = require('../../lib/entity/peer');
var logger  = require('../../lib/logger')('multicaster');

var fifo = async.queue(function (task, callback) {
  task(callback);
}, constants.NETWORK.MAX_CONCURRENT_POST);

module.exports = function (isolate) {
  return new Multicaster(isolate);
};

function Multicaster (isolate) {

  stream.Transform.call(this, { objectMode: true });

  var that = this;

  this._write = function (obj, enc, done) {
    that.emit(obj.type, obj.obj, obj.peers);
    done();
  };
  
  that.on('identity', function(idty, peers) {
    logger.debug('--> new Identity with %s certs to be sent to %s peer(s)', (idty.certs || []).length, peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        sendIdentity(peer, idty).finally(sent);
      });
    });
  });

  that.on('block', function(block, peers) {
    logger.debug('--> new Block to be sent to %s peer(s)', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        sendBlock(peer, block).finally(sent);
      });
    });
  });
  
  that.on('transaction', function(transaction, peers) {
    logger.debug('--> new Transaction to be sent to %s peer(s)', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        sendTransaction(peer, transaction).finally(sent);
      });
    });
  });
  
  that.on('peer', function(peering, peers) {
    if(!isolate) {
      logger.debug('--> new Peer to be sent to %s peer(s)', peers.length);
      peers.forEach(function(peer){
        fifo.push(function (sent) {
          sendPeer(Peer.statics.peerize(peer), Peer.statics.peerize(peering)).finally(sent);
        });
      });
    } else {
      logger.debug('[ISOLATE] Prevent --> new Peer to be sent to %s peer(s)', peers.length);
    }
  });
  
  that.on('membership', function(membership, peers) {
    logger.debug('--> new Membership to be sent to %s peer(s)', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        sendMembership(peer, membership).finally(sent);
      });
    });
  });

  this.sendBlock = sendBlock;
  this.sendPeering = sendPeering;

  function post(peer, url, data) {
    if (!peer.isReachable()) {
      return Q();
    }
    return Q.Promise(function(resolve, reject){
      var postReq = request.post({
        "uri": 'http://' + peer.getURL() + url,
        "timeout": 1000 * 10
      }, function (err, res) {
        if (err) {
          that.push({ unreachable: true, peer: { pubkey: peer.pubkey }});
          return reject(err);
        }
        resolve(res);
      });
      postReq.form(data);
    });
  }

  function sendIdentity(peer, idty) {
    var keyID = peer.keyID();
    logger.info('POST identity to %s', keyID.match(/Unknown/) ? peer.getURL() : keyID);
    return post(peer, '/wot/add', {
      "pubkey": idty.getRawPubkey(),
      "self": idty.getRawSelf(),
      "other": idty.getRawOther()
    });
  }

  function sendBlock(peer, block) {
    var keyID = peer.keyID();
    logger.info('POST block to %s', keyID.match(/Unknown/) ? peer.getURL() : keyID);
    return post(peer, '/blockchain/block', {
      "block": block.getRawSigned()
    });
  }

  function sendTransaction(peer, transaction) {
    logger.info('POST transaction to %s', peer.keyID());
    return post(peer, '/tx/process', {
      "transaction": transaction.getRaw(),
      "signature": transaction.signature
    });
  }

  function sendPeering(toPeer, peer) {
    logger.info('POST peering to %s (%s)', toPeer.keyID(), toPeer.getURL());
    return post(toPeer, '/network/peering/peers', {
      "peer": peer.getRawSigned()
    });
  }

  function sendMembership(peer, membership) {
    logger.info('POST membership to %s', peer.keyID());
    return post(peer, '/blockchain/membership', {
      "membership": membership.getRaw(),
      "signature": membership.signature
    });
  }

  function sendPeer(peer, thePeering) {
    logger.info('POST peering %s to peer %s', thePeering.keyID(), peer.keyID());
    return post(peer, "/network/peering/peers", {
      peer: thePeering.getRawSigned()
    });
  }
}

util.inherits(Multicaster, stream.Transform);

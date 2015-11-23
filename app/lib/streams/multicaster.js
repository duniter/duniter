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

module.exports = function (isolate, timeout) {
  return new Multicaster(isolate, timeout);
};

function Multicaster (isolate, timeout) {

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
    logger.debug('--> new Block#%s to be sent to %s peer(s)', block.number, peers.length);
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

  function post(peer, url, data, done) {
    if (!peer.isReachable()) {
      return Q();
    }
    return Q.Promise(function(resolve, reject){
      var postReq = request.post({
        "uri": 'http://' + peer.getURL() + url,
        "timeout": timeout || constants.NETWORK.DEFAULT_TIMEOUT
      }, function (err, res) {
        // TODO: set unreachable only if problem of connection
        /*if (err) {
          that.push({ unreachable: true, peer: { pubkey: peer.pubkey }});
          return reject(err);
        }*/
        resolve(res);
      });
      postReq.form(data);
    })
      .then(function(){
        done && done();
      })
      .catch(function(err) {
        done && done(err);
        throw err;
      });
  }

  function sendIdentity(peer, idty, done) {
    var keyID = peer.keyID();
    logger.info('POST identity to %s', keyID.match(/Unknown/) ? peer.getURL() : keyID);
    return post(peer, '/wot/add', {
      "pubkey": idty.getRawPubkey(),
      "self": idty.getRawSelf(),
      "other": idty.getRawOther()
    }, done);
  }

  function sendBlock(peer, block, done) {
    var keyID = peer.keyID();
    logger.info('POST block#%s to %s', block.number, keyID.match(/Unknown/) ? peer.getURL() : keyID);
    return post(peer, '/blockchain/block', {
      "block": block.getRawSigned()
    }, done);
  }

  function sendTransaction(peer, transaction, done) {
    logger.info('POST transaction to %s', peer.keyID());
    return post(peer, '/tx/process', {
      "transaction": transaction.getRaw(),
      "signature": transaction.signature
    }, done);
  }

  function sendPeering(toPeer, peer, done) {
    logger.info('POST peering to %s (%s)', toPeer.keyID(), toPeer.getURL());
    return post(toPeer, '/network/peering/peers', {
      "peer": peer.getRawSigned()
    }, done);
  }

  function sendMembership(peer, membership, done) {
    logger.info('POST membership to %s', peer.keyID());
    return post(peer, '/blockchain/membership', {
      "membership": membership.getRaw(),
      "signature": membership.signature
    }, done);
  }

  function sendPeer(peer, thePeering, done) {
    logger.info('POST peering %s to peer %s', thePeering.keyID(), peer.keyID());
    return post(peer, "/network/peering/peers", {
      peer: thePeering.getRawSigned()
    }, done);
  }
}

util.inherits(Multicaster, stream.Transform);

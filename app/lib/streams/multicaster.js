"use strict";
var stream  = require('stream');
var util    = require('util');
var request = require('request');
var async   = require('async');
var logger  = require('../../lib/logger')('multicaster');

var fifo = async.queue(function (task, callback) {
  task(callback);
}, 10);

module.exports = function () {
  return new Multicaster();
};

function Multicaster () {

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
        sendIdentity(peer, idty, success(function (err) {
        }));
        sent();
      });
    });
  });

  that.on('block', function(block, peers) {
    logger.debug('--> new Block to be sent to %s peer(s)', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        sendBlock(peer, block, success(function (err) {
        }));
        sent();
      });
    });
  });
  
  that.on('transaction', function(transaction, peers) {
    logger.debug('--> new Transaction to be sent to %s peer(s)', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        sendTransaction(peer, transaction, success(function (err) {
          sent();
        }));
      });
    });
  });
  
  that.on('peer', function(peering, peers, done) {
    //logger.debug('--> new Peer to be sent to %s peer(s)', peers.length);
    //peers.forEach(function(peer){
    //  fifo.push(function (sent) {
    //    // Do propagating
    //    logger.debug('sending peer %s to peer %s', peering.keyID(), peer.keyID());
    //    post(peer, "/network/peering/peers", {
    //      peer: peering.getRawSigned()
    //    }, function (err, res, body) {
    //      // Sent!
    //      sent();
    //      if (typeof done == 'function') {
    //        done(err, res, body);
    //      }
    //    });
    //  });
    //});
  });
  
  that.on('status', function(status, peers) {
    //logger.debug('--> new Status to be sent to %s peer(s)', peers.length);
    //peers.forEach(function(peer){
    //  fifo.push(function (sent) {
    //    // Do propagating
    //    logger.debug('sending %s status to peer %s', status.status, peer.keyID());
    //    post(peer, "/network/peering/status", {
    //      status: status.getRawSigned(),
    //      peer: status.peer ? status.peer.getRawSigned() : null
    //    }, function (err, res, body) {
    //      // Sent!
    //      sent(err);
    //    });
    //  });
    //});
  });
  
  that.on('membership', function(membership, peers) {
    logger.debug('--> new Membership to be sent to %s peer(s)', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        sendMembership(peer, membership, success(function (err) {
          sent();
        }));
      });
    });
  });

  this.sendBlock = sendBlock;

  function post(peer, url, data, done) {
    reach(peer, function(){
      var postReq = request.post({
        "uri": 'http://' + peer.getURL() + url,
        "timeout": 1000*10
      }, function (err, res, body) {
        if (err)
          that.push({ unreachable: true, peer: { pubkey: peer.pubkey }});
        done(err, res, body);
      });
      postReq.form(data);
    }, done);
  }

  function sendIdentity(peer, idty, done) {
    var keyID = peer.keyID();
    logger.info('POST identity to %s', keyID.match(/Unknown/) ? peer.getURL() : keyID);
    post(peer, '/wot/add', {
      "pubkey": idty.getRawPubkey(),
      "self": idty.getRawSelf(),
      "other": idty.getRawOther()
    }, done);
  }

  function sendBlock(peer, block, done) {
    var keyID = peer.keyID();
    logger.info('POST block to %s', keyID.match(/Unknown/) ? peer.getURL() : keyID);
    post(peer, '/blockchain/block', {
      "block": block.getRawSigned()
    }, done);
  }

  function sendTransaction(peer, transaction, done) {
    logger.info('POST transaction to %s', peer.keyID());
    post(peer, '/tx/process', {
      "transaction": transaction.getRaw(),
      "signature": transaction.signature
    }, done);
  }

  function sendPeering(toPeer, peer, done) {
    logger.info('POST peering to %s', toPeer.keyID());
    post(toPeer, '/network/peering/peers', {
      "entry": peer.getRaw(),
      "signature": peer.signature
    }, done);
  }

  function sendMembership(peer, membership, done) {
    logger.info('POST membership to %s', peer.keyID());
    post(peer, '/blockchain/membership', {
      "membership": membership.getRaw(),
      "signature": membership.signature
    }, done);
  }

  function success (done) {
    return function (err, res, body) {
      if (err) {
        logger.error(err);
      }
      done(err, res, body);
    };
  }

  function get(peer, url, done) {
    reach(peer, function(){
      logger.debug('GET http://' + peer.getURL() + url);
      request
      .get('http://' + peer.getURL() + url)
      .end(done);
    }, done);
  }

  function reach (peer, onSuccess, done) {
    if (!peer.isReachable()) {
      logger.debug('Host is not reachable through HTTP API');
      done();
    } else {
      onSuccess();
    }
  }
}

util.inherits(Multicaster, stream.Transform);

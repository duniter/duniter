var stream  = require('stream');
var util    = require('util');
var request = require('request');
var async   = require('async');
var logger  = require('../../lib/logger')('multicaster');

var fifo = async.queue(function (task, callback) {
  task(callback);
}, 1);

module.exports = function () {
  return new Multicaster();
}

function Multicaster () {

  stream.Transform.call(this, { objectMode: true });

  var that = this;

  this._write = function (obj, enc, done) {
    that.emit(obj.type, obj.obj, obj.peers);
    done();
  }
  
  that.on('pubkey', function(pubkey, peers) {
    logger.debug('--> new Pubkey to be sent to %s peer(s)', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        sendPubkey(peer, pubkey, success(function (err) {
          sent();
        }));
      });
    });
  });
  
  that.on('keyblock', function(keyblock, peers) {
    logger.debug('--> new Keyblock to be sent to %s peer(s)', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        sendKeyblock(peer, keyblock, success(function (err) {
          sent();
        }));
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
  
  that.on('wallet', function(wallet, peers) {
    logger.debug('--> new Wallet to be sent to %s peer(s)', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        sendWallet(peer, wallet, success(function (err) {
          sent();
        }));
      });
    });
  });
  
  that.on('peer', function(peering, peers, done) {
    logger.debug('--> new Peer to be sent to %s peer(s)', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        // Do propagating
        logger.debug('sending peering of %s to peer %s', peering.keyID(), peer.keyID());
        post(peer, "/network/peering/peers", {
          entry: peering.getRaw(),
          signature: peering.signature
        }, function (err, res, body) {
          // Sent!
          sent();
          if (typeof done == 'function') {
            done(err, res, body);
          }
        });
      });
    });
  });
  
  that.on('status', function(status, peers) {
    logger.debug('--> new Status to be sent to %s peer(s)', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        // Do propagating
        logger.debug('sending %s status to peer %s', status.status, peer.keyID());
        post(peer, "/network/peering/status", {
          status: status.getRaw(),
          signature: status.signature
        }, function (err, res, body) {
          // Sent!
          sent(err);
        });
      });
    });
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
  
  that.on('forward', function(forward, peers, done) {
    logger.debug('--> new Forward to be sent to %s peer(s)', peers.length);
    fifo.push(function (sent) {
      async.forEach(peers, function(peer, callback){
        // Do propagating
        logger.debug('sending %s forward to peer %s', forward.forward, peer.keyID());
        post(peer, "/network/peering/forward", {
          forward: forward.getRaw(),
          signature: forward.signature
        }, function (err, res, body) {
          // Sent!
          sent();
          if (typeof done == 'function') {
            done(err, res, body);
          }
        });
      }, function(err){
        if (typeof done == 'function') {
          done(err);
        }
        sent();
      });
    });
  });

  this.sendPubkey = sendPubkey;
  this.sendKeyblock = sendKeyblock;
}

util.inherits(Multicaster, stream.Transform);

function sendPubkey(peer, pubkey, done) {
  var keyID = peer.keyID();
  logger.info('POST pubkey to %s', keyID.match(/\?/) ? peer.getURL() : keyID);
  post(peer, '/pks/add', {
    "keytext": pubkey.getRaw(),
    "keysign": pubkey.signature
  }, done);
}

function sendKeyblock(peer, keyblock, done) {
  var keyID = peer.keyID();
  logger.info('POST keyblock to %s', keyID.match(/\?/) ? peer.getURL() : keyID);
  post(peer, '/keychain/keyblock', {
    "keyblock": keyblock.getRaw(),
    "signature": keyblock.signature
  }, done);
}

function sendTransaction(peer, transaction, done) {
  logger.info('POST transaction to %s', peer.keyID());
  post(peer, '/hdc/transactions/process', {
    "transaction": transaction.getRaw(),
    "signature": transaction.signature
  }, done);
}

function sendWallet(peer, entry, done) {
  logger.info('POST Wallet entry %s to %s', entry.keyID(), peer.keyID());
  post(peer, '/network/wallet', {
    "entry": entry.getRaw(),
    "signature": entry.signature
  }, done);
}

function sendPeering(toPeer, peer, done) {
  logger.info('POST peering to %s', toPeer.keyID());
  post(toPeer, '/network/peering/peers', {
    "entry": peer.getRaw(),
    "signature": peer.signature
  }, done);
}

function sendForward(peer, rawForward, signature, done) {
  logger.info('POST forward to %s', peer.keyID());
  post(peer, '/network/peering/forward', {
    "forward": rawForward,
    "signature": signature
  }, done);
}

function sendMembership(peer, membership, done) {
  logger.info('POST membership to %s', peer.keyID());
  post(peer, '/registry/community/members', {
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

function post(peer, url, data, done) {
  reach(peer, function(){
    var postReq = request.post('http://' + peer.getURL() + url, function (err, res, body) {
      if (err)
        logger.debug('Error while connecting to %s: %s', peer.keyID(), err.toString());
      done(err, res, body);
    });
    postReq.form(data);
  }, done);
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

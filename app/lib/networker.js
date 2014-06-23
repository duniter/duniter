var async   = require('async');
var request = require('request');
var logger  = require('../lib/logger')('networker');

var fifo = async.queue(function (task, callback) {
  task(callback);
}, 1);

module.exports = function (eventEmitter) {
  
  eventEmitter.on('pubkey', function(pubkey, peers) {
    logger.debug('new pubkey to be sent to %s peers', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        sendPubkey(peer, pubkey, success(function (err) {
          sent();
        }));
      });
    });
  });
  
  eventEmitter.on('vote', function(vote, peers) {
    logger.debug('new vote to be sent to %s peers', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        sendVote(peer, vote, success(function (err) {
          sent();
        }));
      });
    });
  });
  
  eventEmitter.on('transaction', function(transaction, peers) {
    logger.debug('new transaction to be sent to %s peers', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        sendTransaction(peer, transaction, success(function (err) {
          sent();
        }));
      });
    });
  });
  
  eventEmitter.on('wallet', function(wallet, peers) {
    logger.debug('new Wallet to be sent to %s peers', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        sendWallet(peer, wallet, success(function (err) {
          sent();
        }));
      });
    });
  });
  
  eventEmitter.on('peer', function(peering, peers, done) {
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
  
  eventEmitter.on('status', function(status, peers, internal) {
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
          if (!err && res && res.statusCode == 400 && !internal) {
            logger.debug('sending self peering to peer %s', peer.keyID());
            eventEmitter.emit('peer', eventEmitter.peer(), [peer], function (err, res, body) {
              eventEmitter.emit('status', status, [peer], true);
            });
          } 
        });
      });
    });
  });
  
  eventEmitter.on('membership', function(membership, peers) {
    logger.debug('new membership to be sent to %s peers', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        sendMembership(peer, membership, success(function (err) {
          sent();
        }));
      });
    });
  });
  
  eventEmitter.on('voting', function(voting, peers) {
    logger.debug('new voting to be sent to %s peers', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        sendVoting(peer, voting, success(function (err) {
          sent();
        }));
      });
    });
  });
  
  eventEmitter.on('forward', function(forward, peers, done) {
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
        done(err);
        sent();
      });
    });
  });
};

function sendPubkey(peer, pubkey, done) {
  logger.info('POST pubkey to %s', peer.keyID());
  post(peer, '/pks/add', {
    "keytext": pubkey.getRaw(),
    "keysign": pubkey.signature
  }, done);
}

function sendVote(peer, vote, done) {
  logger.info('POST vote to %s', peer.keyID());
  post(peer, '/hdc/amendments/votes', {
    "amendment": vote.getRaw(),
    "signature": vote.signature
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

function sendVoting(peer, voting, done) {
  logger.info('POST voting to %s', peer.keyID());
  post(peer, '/registry/community/voters', {
    "voting": voting.getRaw(),
    "signature": voting.signature
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

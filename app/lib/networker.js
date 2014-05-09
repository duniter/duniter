var async  = require('async');
var logger = require('../lib/logger')('networker');

var fifo = async.queue(function (task, callback) {
  task(callback);
}, 1);

module.exports = function (peeringService) {
  
  peeringService.on('pubkey', function(pubkey, peers) {
    logger.debug('new pubkey to be sent to %s peers', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        // Do propagating
        logger.debug('Propagating key %s to peer %s', pubkey.fingerprint, peer.fingerprint);
        // Sent!
        sent();
      });
    });
  });
  
  peeringService.on('vote', function(vote, peers) {
    logger.debug('new vote to be sent to %s peers', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        // Do propagating
        logger.debug('Propagating vote from %s to peer %s', vote.issuer, peer.fingerprint);
        // Sent!
        sent();
      });
    });
  });
  
  peeringService.on('transaction', function(transaction, peers) {
    logger.debug('new transaction to be sent to %s peers', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        // Do propagating
        logger.debug('Propagating transaction from %s to peer %s', transaction.issuer, peer.fingerprint);
        // Sent!
        sent();
      });
    });
  });
  
  peeringService.on('tht', function(thtentry, peers) {
    logger.debug('new Wallet entry to be sent to %s peers', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        // Do propagating
        logger.debug('Propagating Wallet entry from %s to peer %s', thtentry.issuer, peer.fingerprint);
        // Sent!
        sent();
      });
    });
  });
  
  peeringService.on('peer', function(peering, peers) {
    logger.debug('new peer to be sent to %s peers', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        // Do propagating
        logger.debug('Propagating peering of peer %s to peer %s', peering.fingerprint, peer.fingerprint);
        // Sent!
        sent();
      });
    });
  });
  
  peeringService.on('status', function(status, peers) {
    logger.debug('new status to be sent to %s peers', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        // Do propagating
        logger.debug('Propagating status of peer %s to peer %s', status.fingerprint, peer.fingerprint);
        // Sent!
        sent();
      });
    });
  });
  
  peeringService.on('membership', function(membership, peers) {
    logger.debug('new membership to be sent to %s peers', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        // Do propagating
        logger.debug('Propagating membership of peer %s to peer %s', membership.fingerprint, peer.fingerprint);
        // Sent!
        sent();
      });
    });
  });
  
  peeringService.on('voting', function(voting, peers) {
    logger.debug('new voting to be sent to %s peers', peers.length);
    peers.forEach(function(peer){
      fifo.push(function (sent) {
        // Do propagating
        logger.debug('Propagating voting of peer %s to peer %s', voting.fingerprint, peer.fingerprint);
        // Sent!
        sent();
      });
    });
  });
};

// this.propagateToFingerprint = function (fpr, obj, sendMethod, done) {
//   async.waterfall([
//     function (next){
//       Peer.find({ fingerprint: fpr }, next);
//     },
//     function (peers, next){
//       if(peers.length > 0){
//         var remote = peers[0];
//         async.waterfall([
//           function (next){
//             if (remote.status == "NOTHING" && remote.statusSent == "NOTHING") {
//               // Send peering entry
//               logger.debug("NEVER KNOWN peer %s, send self peering", remote.fingerprint);
//               that.submitSelfPeering(remote, function (err) {
//                 next(err);
//               });
//             } else {
//               next();
//             }
//           },
//           function (next){
//             sendMethod.call(sendMethod, remote, obj, next);
//           }
//         ], next);
//       }
//       else next();
//     },
//   ], function (err) {
//     done();
//   });
// };

function sendPubkey(peer, pubkey, done) {
  logger.info('POST pubkey to %s', peer.fingerprint);
  post(peer, '/pks/add', {
    "keytext": pubkey.getRaw(),
    "keysign": pubkey.signature
  }, done);
}

function sendVote(peer, vote, done) {
  logger.info('POST vote to %s', peer.fingerprint);
  post(peer, '/hdc/amendments/votes', {
    "amendment": vote.getRaw(),
    "signature": vote.signature
  }, done);
}

function sendTransaction(peer, transaction, done) {
  logger.info('POST transaction to %s', peer.fingerprint);
  post(peer, '/hdc/transactions/process', {
    "transaction": transaction.getRaw(),
    "signature": transaction.signature
  }, done);
}

function sendWallet(peer, entry, done) {
  logger.info('POST Wallet entry %s to %s', entry.fingerprint, peer.fingerprint);
  post(peer, '/network/tht', {
    "entry": entry.getRaw(),
    "signature": entry.signature
  }, done);
}

function sendPeering(toPeer, peer, done) {
  logger.info('POST peering to %s', toPeer.fingerprint);
  post(toPeer, '/network/peering/peers', {
    "entry": peer.getRaw(),
    "signature": peer.signature
  }, done);
}

function sendForward(peer, rawForward, signature, done) {
  logger.info('POST forward to %s', peer.fingerprint);
  post(peer, '/network/peering/forward', {
    "forward": rawForward,
    "signature": signature
  }, done);
}

function sendStatus(peer, status, done) {
  logger.info('POST status %s to %s', status.status, peer.fingerprint);
  var previouslySent = peer.statusSent;
  async.waterfall([
    function (next) {
      peer.statusSent = status.status;
      peer.statusSentPending = true;
      peer.save(function (err) {
        next(err);
      });
    },
    function (next){
      post(peer, '/network/peering/status', {
        "status": status.getRaw(),
        "signature": status.signature
      }, next);
    }
  ], function (err){
    peer.statusSentPending = false;
    if (err) {
      peer.statusSent = previouslySent;
    }
    peer.save(function (err2) {
      done(err || err2);
    });
  });
}

function post(peer, url, data, done) {
  var postReq = request.post('http://' + peer.getURL() + url, function (err, res, body) {
    done(err, res, body);
    // peer.setStatus((err && Peer.status.DOWN) || Peer.status.UP, function (err) {
    //   done(err, res, body);
    // });
  });
  postReq.form(data);
}

function get(peer, url, done) {
  logger.debug('GET http://' + peer.getURL() + url);
  request
  .get('http://' + peer.getURL() + url)
  .end(done);
}

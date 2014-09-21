var async    = require('async');
var sha1     = require('sha1');
var util     = require('util');
var stream   = require('stream');

module.exports = function (serverFPR, conn) {
  return new Router(serverFPR, conn);
};

function Router (serverFPR, conn) {

  var Merkle      = conn.model('Merkle');
  var Key         = conn.model('Key');
  var Amendment   = conn.model('Amendment');
  var Transaction = conn.model('Transaction');
  var Peer        = conn.model('Peer');

  stream.Transform.call(this, { objectMode: true });

  var that = this;

  this._write = function (obj, enc, done) {
    if (typeof obj.email != 'undefined') {                           route('pubkey',      obj, getRandomInUPPeers,                          done); }
    else if (obj.keysChanges ? true : false) {                       route('keyblock',    obj, getRandomInUPPeers,                          done); }
    else if (obj.recipient ? true : false) {                         route('transaction', obj, getTargetedButSelf(obj.recipient),           done); }
    else if (obj.endpoints ? true : false) {                         route('peer',        obj, getRandomInAllPeersButPeer(obj.fingerprint), done); }
    else if (obj.status ? true : false) {                            route('status',      obj, getTargetedButSelf(obj.to),                  done); }
    else if (obj.type && obj.type == "MEMBERSHIP" ? true : false) {  route('membership',  obj, getRandomInUPPeers,                          done); }
    else {
      done();
    }
  };

  function route (type, obj, getPeersFunc, done) {
    getPeersFunc(function (err, peers) {
      that.push({
        'type': type,
        'obj': obj,
        'peers': peers || []
      });
      done();
    });
  }

  function getRandomInAllPeersButPeer (fpr) {
    return function (done) {
      Peer.getRandomlyWithout([serverFPR, fpr], done);
    };
  };

  function getRandomInUPPeers (done) {
    Peer.getRandomlyUPsWithout([serverFPR], done);
  };

  /**
  * Get the peer targeted by `to` argument, this node excluded (for not to loop on self).
  */
  function getTargetedButSelf (to) {
    return function (done) {
      if (to == serverFPR) {
        done(null, []);
      } else {
        Peer.getTheOne(to, function (err, peer) {
          done(err, [peer]);
        });
      }
    };
  }
};

util.inherits(Router, stream.Transform);

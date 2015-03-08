var async    = require('async');
var sha1     = require('sha1');
var util     = require('util');
var stream   = require('stream');
var logger   = require('../../lib/logger')('router');

module.exports = function (serverPubkey, conn, conf, dal) {
  return new Router(serverPubkey, conn, conf, dal);
};

function Router (serverPubkey, conn, conf, dal) {

  var Identity = conn.model('Identity');
  var Merkle   = conn.model('Merkle');
  var Block    = conn.model('Block');
  var Peer     = conn.model('Peer');

  stream.Transform.call(this, { objectMode: true });

  var that = this;

  this._write = function (obj, enc, done) {
         if (obj.joiners) {                      route('block',       obj, getRandomInUPPeers(),                        done); }
    // else if (obj.pubkey && obj.uid) {            route('identity',    obj, getRandomInUPPeers(),                        done); }
    // else if (obj.userid) {                       route('membership',  obj, getRandomInUPPeers(),                        done); }
    else if (obj.inputs) {                       route('transaction', obj, getRandomInUPPeers(),                        done); }
    else if (obj.endpoints) {                    route('peer',        obj, getRandomInUPPeersBut(obj.pub),              done); }
    else if (obj.from && obj.from == serverPubkey) {
      // Route ONLY status emitted by this node
      route('status', obj, getTargeted(obj.to), done);
    }
    else if (obj.unreachable) {
      async.waterfall([
        function (next) {
          dal.setPeerDown(obj.peer.pubkey, next);
        },
        function (next) {
          Merkle.updateForPeers(dal, next);
        }
      ], function(err) {
        if (err) logger.error(err);
        else logger.info("Peer %s unreachable: now considered as DOWN.", obj.peer.pubkey);
      });
    }
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

  function getRandomInUPPeers (done) {
    return getValidUpPeers([serverPubkey]);
  };

  function getRandomInUPPeersBut (pubkey) {
    return getValidUpPeers([serverPubkey, pubkey]);
  };

  function getValidUpPeers (without) {
    return function (done) {
      var members = [];
      var nonmembers = [];
      async.waterfall([
        Block.current.bind(Block),
        function (current, next) {
          dal.getRandomlyUPsWithout(without, current.medianTime - conf.avgGenTime*10, next); // Peers with status UP
        },
        function (peers, next) {
          async.forEachSeries(peers, function (p, callback) {
            async.waterfall([
              function (next) {
                Identity.isMember(p.pub, next);
              },
              function (isMember, next) {
                isMember ? members.push(p) : nonmembers.push(p);
                next();
              }
            ], callback);
          }, next);
        },
        function (next) {
          logger.debug('New document to send to %s member and %s non-member peers', members.length, nonmembers.length);
          async.parallel({
            members: async.apply(choose4in, members), // Choose up to 4 member peers
            nonmembers: async.apply(choose4in, nonmembers) // Choose up to 4 non-member peers
          }, next);
        },
        function (res, next) {
          var chosen = res.members.concat(res.nonmembers);
          next(null, chosen);
        }
      ], done);
    }
  }

  /**
  * Get the peer targeted by `to` argument, this node excluded (for not to loop on self).
  */
  function getTargeted (to) {
    return function (done) {
      if (to == serverPubkey) {
        done(null, []);
      } else {
        dal.getPeer(to, function (err, peer) {
          done(err, [peer]);
        });
      }
    };
  }

  function choose4in (peers, done) {
    var chosen = [];
    var nbPeers = peers.length;
    for (var i = 0; i < Math.min(nbPeers, 4); i++) {
      var randIndex = Math.max(Math.floor(Math.random()*10) - (10 - nbPeers) - i, 0);
      chosen.push(peers[randIndex]);
      peers.splice(randIndex, 1);
    }
    done(null, chosen);
  }
};

util.inherits(Router, stream.Transform);

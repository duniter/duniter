"use strict";

const co = require('co');
const _ = require('underscore');
const async    = require('async');
const util     = require('util');
const stream   = require('stream');
const Peer     = require('../entity/peer');
const constants = require('../constants');

module.exports = function (PeeringService, conf, dal) {
  return new Router(PeeringService, conf, dal);
};

function Router (PeeringService, conf, dal) {
  
  this.setConfDAL = (theConf, theDAL) => {
    dal = theDAL;
  };

  const logger   = require('../logger')(dal.profile);

  stream.Transform.call(this, { objectMode: true });

  let active = true;

  this.setActive = (shouldBeActive) => active = shouldBeActive;

  const that = this;

  this._write = function (obj, enc, done) {
         if (obj.joiners) {                      route('block',       obj, getRandomInUPPeers(),                        done); }
    else if (obj.pubkey && obj.uid) {            route('identity',    obj, getRandomInUPPeers(),                        done); }
    else if (obj.userid) {                       route('membership',  obj, getRandomInUPPeers(),                        done); }
    else if (obj.inputs) {                       route('transaction', obj, getRandomInUPPeers(),                        done); }
    else if (obj.endpoints) {                    route('peer',        obj, getRandomInUPPeersBut(obj.pubkey),           done); }
    else if (obj.from && obj.from == PeeringService.pubkey) {
      // Route ONLY status emitted by this node
      route('status', obj, getTargeted(obj.to), done);
    }
    else if (obj.unreachable) {
      async.waterfall([
        function (next) {
          dal.setPeerDown(obj.peer.pubkey)
            .then(function(){
              next();
            })
            .catch(next);
        },
      ], function(err) {
        if (err) logger.error(err);
        else logger.info("Peer %s unreachable: now considered as DOWN.", obj.peer.pubkey);
        done();
      });
    }
    else {
      done();
    }       
  };

  function route (type, obj, getPeersFunc, done) {
    if (!active) {
      return done();
    }
    getPeersFunc(function (err, peers) {
      that.push({
        'type': type,
        'obj': obj,
        'peers': (peers || []).map(Peer.statics.peerize)
      });
      done();
    });
  }

  function getRandomInUPPeers () {
    return getValidUpPeers([PeeringService.pubkey]);
  }

  function getRandomInUPPeersBut (pubkey) {
    return getValidUpPeers([PeeringService.pubkey, pubkey]);
  }

  function getValidUpPeers (without) {
    return function (done) {
      return co(function *() {
        let members = [];
        let nonmembers = [];
        let peers = yield dal.getRandomlyUPsWithout(without); // Peers with status UP
        for (const p of peers) {
          let isMember = yield dal.isMember(p.pubkey);
          isMember ? members.push(p) : nonmembers.push(p);
        }
        members = chooseXin(members, constants.NETWORK.MAX_MEMBERS_TO_FORWARD_TO);
        nonmembers = chooseXin(nonmembers, constants.NETWORK.MAX_NON_MEMBERS_TO_FORWARD_TO);
        return members.map((p) => (p.member = true) && p).concat(nonmembers);
      })
        .then(_.partial(done, null)).catch(done);
    };
  }

  /**
  * Get the peer targeted by `to` argument, this node excluded (for not to loop on self).
  */
  function getTargeted (to) {
    return function (done) {
      if (to == PeeringService.pubkey) {
        done(null, []);
      } else {
        dal.getPeer(to)
          .then((peer) => done(null, [peer]))
          .catch((err) => done(err));
      }
    };
  }

  function chooseXin (peers, max) {
    const chosen = [];
    const nbPeers = peers.length;
    for (let i = 0; i < Math.min(nbPeers, max); i++) {
      const randIndex = Math.max(Math.floor(Math.random() * 10) - (10 - nbPeers) - i, 0);
      chosen.push(peers[randIndex]);
      peers.splice(randIndex, 1);
    }
    return chosen;
  }
}

util.inherits(Router, stream.Transform);

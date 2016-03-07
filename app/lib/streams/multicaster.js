"use strict";
var Q       = require('q');
var stream  = require('stream');
var util    = require('util');
var request = require('request');
var co      = require('co');
var constants = require('../../lib/constants');
var Peer    = require('../../lib/entity/peer');
var Identity = require('../../lib/entity/identity');
var Revocation = require('../../lib/entity/revocation');
var Membership = require('../../lib/entity/membership');
var Block = require('../../lib/entity/block');
var Transaction = require('../../lib/entity/transaction');
var logger  = require('../../lib/logger')('multicaster');

const WITH_ISOLATION = true;

module.exports = function (conf, timeout) {
  return new Multicaster(conf, timeout);
};

function Multicaster (conf, timeout) {

  stream.Transform.call(this, { objectMode: true });

  var that = this;

  let blockForward = forward({
    transform: Block.statics.fromJSON,
    type: 'Block',
    uri: '/blockchain/block',
    getObj: (block) => {
      return {
        "block": block.getRawSigned()
      };
    },
    getDocID: (block) => 'block#' + block.number
  });

  let idtyForward = forward({
    transform: Identity.statics.fromJSON,
    type: 'Identity',
    uri: '/wot/add',
    getObj: (idty) => {
      return {
        "identity": idty.selfCert()
      };
    },
    getDocID: (idty) => 'with ' + (idty.certs || []).length + ' certs'
  });

  let certForward = forward({
    transform: Identity.statics.fromJSON,
    type: 'Cert',
    uri: '/wot/certify',
    getObj: (cert) => {
      return {
        "cert": cert.getRaw()
      };
    },
    getDocID: (idty) => 'with ' + (idty.certs || []).length + ' certs'
  });

  let revocationForward = forward({
    transform: Revocation.statics.fromJSON,
    type: 'Revocation',
    uri: '/wot/revoke',
    getObj: (revocation) => {
      return {
        "revocation": revocation.getRaw()
      };
    },
    getDocID: (idty) => 'with ' + (idty.certs || []).length + ' certs'
  });

  let txForward = forward({
    transform: Transaction.statics.fromJSON,
    type: 'Transaction',
    uri: '/tx/process',
    getObj: (transaction) => {
      return {
        "transaction": transaction.getRaw(),
        "signature": transaction.signature
      };
    }
  });

  let peerForward = forward({
    type: 'Peer',
    uri: '/network/peering/peers',
    transform: Peer.statics.peerize,
    getObj: (peering) => {
      return {
        peer: peering.getRawSigned()
      };
    },
    getDocID: (doc) => doc.keyID(),
    withIsolation: WITH_ISOLATION
  });

  let msForward = forward({
    transform: Membership.statics.fromJSON,
    type: 'Membership',
    uri: '/blockchain/membership',
    getObj: (membership) => {
      return {
        "membership": membership.getRaw(),
        "signature": membership.signature
      };
    }
  });
  
  that.on('identity', idtyForward);
  that.on('cert', certForward);
  that.on('revocation', revocationForward);
  that.on('block', blockForward);
  that.on('transaction', txForward);
  that.on('peer', peerForward);
  that.on('membership', msForward);

  this._write = function (obj, enc, done) {
    that.emit(obj.type, obj.obj, obj.peers);
    done();
  };

  this.sendBlock = (toPeer, block) => blockForward(block, [toPeer]);
  this.sendPeering = (toPeer, peer) => peerForward(peer, [toPeer]);

  function forward(params) {
    return function(doc, peers) {
      return co(function *() {
        try {
          if(!params.withIsolation || !(conf && conf.isolate)) {
            let theDoc = params.transform ? params.transform(doc) : doc;
            logger.debug('--> new %s to be sent to %s peer(s)', params.type, peers.length);
            if (params.getDocID) {
              logger.info('POST %s %s', params.type, params.getDocID(theDoc));
            } else {
              logger.info('POST %s', params.type);
            }
            for (let i = 0, len = peers.length; i < len; i++) {
              let p = peers[i];
              let peer = Peer.statics.peerize(p);
              logger.debug(' `--> to peer %s [%s] (%s)', peer.keyID(), peer.member ? 'member' : '------', peer.getNamedURL());
              yield post(peer, params.uri, params.getObj(theDoc));
            }
          } else {
            logger.debug('[ISOLATE] Prevent --> new Peer to be sent to %s peer(s)', peers.length);
          }
        } catch (err) {
          logger.error(err);
        }
      });
    };
  }

  function post(peer, url, data) {
    if (!peer.isReachable()) {
      return Q();
    }
    return Q.Promise(function(resolve){
      var postReq = request.post({
        "uri": 'http://' + peer.getURL() + url,
        "timeout": timeout || constants.NETWORK.DEFAULT_TIMEOUT
      }, function (err, res) {
        if (err) {
          that.push({ unreachable: true, peer: { pubkey: peer.pubkey }});
          logger.warn(err.message || err);
        }
        resolve(res);
      });
      postReq.form(data);
    });
  }
}

util.inherits(Multicaster, stream.Transform);

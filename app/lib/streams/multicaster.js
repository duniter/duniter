"use strict";
const Q       = require('q');
const stream  = require('stream');
const util    = require('util');
const request = require('request');
const co      = require('co');
const constants = require('../../lib/constants');
const Peer    = require('../../lib/entity/peer');
const Identity = require('../../lib/entity/identity');
const Revocation = require('../../lib/entity/revocation');
const Membership = require('../../lib/entity/membership');
const Block = require('../../lib/entity/block');
const Transaction = require('../../lib/entity/transaction');
const logger  = require('../logger')('multicaster');

const WITH_ISOLATION = true;

module.exports = function (conf, timeout) {
  return new Multicaster(conf, timeout);
};

function Multicaster (conf, timeout) {

  stream.Transform.call(this, { objectMode: true });

  const that = this;

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
        "identity": idty.createIdentity()
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
    getDocID: (doc) => doc.keyID() + '#' + doc.block.match(/(\d+)-/)[1],
    withIsolation: WITH_ISOLATION,
    onError: (resJSON, peering, to) => {
      const sentPeer = Peer.statics.peerize(peering);
      if (Peer.statics.blockNumber(resJSON.peer) > sentPeer.blockNumber()) {
        that.push({ outdated: true, peer: resJSON.peer });
        logger.warn('Outdated peer document (%s) sent to %s', sentPeer.keyID() + '#' + sentPeer.block.match(/(\d+)-/)[1], to);
      }
      return Promise.resolve();
    }
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
            // Parallel treatment for superfast propagation
            yield peers.map((p) => co(function*() {
              let peer = Peer.statics.peerize(p);
              const namedURL = peer.getNamedURL();
              logger.debug(' `--> to peer %s [%s] (%s)', peer.keyID(), peer.member ? 'member' : '------', namedURL);
              try {
                yield post(peer, params.uri, params.getObj(theDoc));
              } catch (e) {
                if (params.onError) {
                  try {
                    const json = JSON.parse(e.body);
                    yield params.onError(json, doc, namedURL);
                  } catch (ex) {
                    logger.warn('Could not reach %s', namedURL);
                  }
                }
              }
            }));
          } else {
            logger.debug('[ISOLATE] Prevent --> new Peer to be sent to %s peer(s)', peers.length);
          }
        } catch (err) {
          logger.error(err);
        }
      });
    };
  }

  function post(peer, uri, data) {
    if (!peer.isReachable()) {
      return Q();
    }
    return Q.Promise(function(resolve, reject){
      const postReq = request.post({
        "uri": 'http://' + peer.getURL() + uri,
        "timeout": timeout || constants.NETWORK.DEFAULT_TIMEOUT
      }, function (err, res) {
        if (err) {
          that.push({ unreachable: true, peer: { pubkey: peer.pubkey }});
          logger.warn(err.message || err);
        }
        if (res && res.statusCode != 200) {
          return reject(res);
        }
        resolve(res);
      });
      postReq.form(data);
    });
  }
}

util.inherits(Multicaster, stream.Transform);

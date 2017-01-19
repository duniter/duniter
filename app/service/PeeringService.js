"use strict";
const co             = require('co');
const util           = require('util');
const _              = require('underscore');
const Q              = require('q');
const events         = require('events');
const rp             = require('request-promise');
const multicaster    = require('../lib/streams/multicaster');
const keyring        = require('duniter-common').keyring;
const logger         = require('../lib/logger')('peering');
const dos2unix       = require('duniter-common').dos2unix;
const hashf          = require('duniter-common').hashf;
const rawer          = require('duniter-common').rawer;
const constants      = require('../lib/constants');
const Peer           = require('../lib/entity/peer');
const AbstractService = require('./AbstractService');
const network = require('../lib/system/network');

function PeeringService(server) {

  AbstractService.call(this);
  let conf, dal, pair, selfPubkey;

  this.setConfDAL = (newConf, newDAL, newPair) => {
    dal = newDAL;
    conf = newConf;
    pair = newPair;
    this.pubkey = pair.publicKey;
    selfPubkey = this.pubkey;
  };

  let peer = null;
  const that = this;

  this.peer = (newPeer) => co(function *() {
    if (newPeer) {
      peer = newPeer;
    }
    let thePeer = peer;
    if (!thePeer) {
      thePeer = yield that.generateSelfPeer(conf, 0);
    }
    return Peer.statics.peerize(thePeer);
  });

  this.mirrorEndpoints = () => co(function *() {
    let localPeer = yield that.peer();
    return getOtherEndpoints(localPeer.endpoints, conf);
  });

  this.checkPeerSignature = function (p) {
    const raw = rawer.getPeerWithoutSignature(p);
    const sig = p.signature;
    const pub = p.pubkey;
    const signaturesMatching = keyring.verify(raw, sig, pub);
    return !!signaturesMatching;
  };

  this.submitP = function(peering, eraseIfAlreadyRecorded, cautious){
    // Force usage of local currency name, do not accept other currencies documents
    peering.currency = conf.currency || peering.currency;
    let thePeer = new Peer(peering);
    let sp = thePeer.block.split('-');
    const blockNumber = parseInt(sp[0]);
    let blockHash = sp[1];
    let sigTime = 0;
    let block;
    let makeCheckings = cautious || cautious === undefined;
    return that.pushFIFO(() => co(function *() {
      if (makeCheckings) {
        let goodSignature = that.checkPeerSignature(thePeer);
        if (!goodSignature) {
          throw 'Signature from a peer must match';
        }
      }
      if (thePeer.block == constants.PEER.SPECIAL_BLOCK) {
        thePeer.statusTS = 0;
        thePeer.status = 'UP';
      } else {
        block = yield dal.getBlockByNumberAndHashOrNull(blockNumber, blockHash);
        if (!block && makeCheckings) {
          throw constants.ERROR.PEER.UNKNOWN_REFERENCE_BLOCK;
        } else if (!block) {
          thePeer.block = constants.PEER.SPECIAL_BLOCK;
          thePeer.statusTS = 0;
          thePeer.status = 'UP';
        }
      }
      sigTime = block ? block.medianTime : 0;
      thePeer.statusTS = sigTime;
      let found = yield dal.getPeerOrNull(thePeer.pubkey);
      let peerEntity = Peer.statics.peerize(found || thePeer);
      if(found){
        // Already existing peer
        const sp2 = found.block.split('-');
        const previousBlockNumber = parseInt(sp2[0]);
        const interfacesChanged = Peer.statics.endpointSum(thePeer) != Peer.statics.endpointSum(peerEntity);
        const isOutdatedDocument = blockNumber < previousBlockNumber && !eraseIfAlreadyRecorded;
        const isAlreadyKnown = blockNumber == previousBlockNumber && !eraseIfAlreadyRecorded;
        if (isOutdatedDocument){
          const error = _.extend({}, constants.ERRORS.NEWER_PEER_DOCUMENT_AVAILABLE);
          _.extend(error.uerr, { peer: found });
          throw error;
        } else if (isAlreadyKnown) {
          throw constants.ERRORS.PEER_DOCUMENT_ALREADY_KNOWN;
        }
        peerEntity = Peer.statics.peerize(found);
        if (interfacesChanged) {
          // Warns the old peer of the change
          const caster = multicaster();
          caster.sendPeering(Peer.statics.peerize(peerEntity), Peer.statics.peerize(thePeer));
        }
        thePeer.copyValues(peerEntity);
        peerEntity.sigDate = new Date(sigTime * 1000);
      }
      // Set the peer as UP again
      peerEntity.status = 'UP';
      peerEntity.first_down = null;
      peerEntity.last_try = null;
      peerEntity.hash = String(hashf(peerEntity.getRawSigned())).toUpperCase();
      peerEntity.raw = peerEntity.getRaw();
      yield dal.savePeer(peerEntity);
      let savedPeer = Peer.statics.peerize(peerEntity);
      if (peerEntity.pubkey == selfPubkey) {
        const localEndpoint = network.getEndpoint(conf);
        const localNodeNotListed = !peerEntity.containsEndpoint(localEndpoint);
        const current = localNodeNotListed && (yield dal.getCurrentBlockOrNull());
        if (!localNodeNotListed) {
          const indexOfThisNode = peerEntity.endpoints.indexOf(localEndpoint);
          if (indexOfThisNode !== -1) {
            server.push({
              nodeIndexInPeers: indexOfThisNode
            });
          } else {
            logger.warn('This node has his interface listed in the peer document, but its index cannot be found.');
          }
        }
        if (localNodeNotListed && (!current || current.number > blockNumber)) {
          // Document with pubkey of local peer, but doesn't contain local interface: we must add it
          that.generateSelfPeer(conf, 0);
        } else {
          peer = peerEntity;
        }
      }
      return savedPeer;
    }));
  };

  this.handleNewerPeer = (pretendedNewer) => {
    logger.debug('Applying pretended newer peer document %s/%s', pretendedNewer.block);
    return server.singleWritePromise(_.extend({ documentType: 'peer' }, pretendedNewer));
  };

  this.generateSelfPeer = (theConf, signalTimeInterval) => co(function*() {
    const current = yield server.dal.getCurrentBlockOrNull();
    const currency = theConf.currency || constants.DEFAULT_CURRENCY_NAME;
    const peers = yield dal.findPeers(selfPubkey);
    let p1 = {
      version: constants.DOCUMENTS_VERSION,
      currency: currency,
      block: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',
      endpoints: []
    };
    if (peers.length != 0 && peers[0]) {
      p1 = _(peers[0]).extend({version: constants.DOCUMENTS_VERSION, currency: currency});
    }
    let endpoint = network.getEndpoint(theConf);
    let otherPotentialEndpoints = getOtherEndpoints(p1.endpoints, theConf);
    logger.info('Sibling endpoints:', otherPotentialEndpoints);
    let reals = yield otherPotentialEndpoints.map((endpoint) => co(function*() {
      let real = true;
      let remote = Peer.statics.endpoint2host(endpoint);
      try {
        // We test only BMA APIs, because other may exist and we cannot judge against them yet
        if (endpoint.startsWith('BASIC_MERKLED_API')) {
          let answer = yield rp('http://' + remote + '/network/peering', { json: true });
          if (!answer || answer.pubkey != selfPubkey) {
            throw Error("Not same pubkey as local instance");
          }
        }
        // We also remove endpoints that are *asked* to be removed in the conf file
        if ((conf.rmEndpoints || []).indexOf(endpoint) !== -1) {
          real = false;
        }
      } catch (e) {
        logger.warn('Wrong endpoint \'%s\': \'%s\'', endpoint, e.message || e);
        real = false;
      }
      return real;
    }));
    let toConserve = otherPotentialEndpoints.filter((ep, i) => reals[i]);
    if (!currency || endpoint == 'BASIC_MERKLED_API') {
      logger.error('It seems there is an issue with your configuration.');
      logger.error('Please restart your node with:');
      logger.error('$ duniter restart');
      return Q.Promise(() => null);
    }
    // Choosing next based-block for our peer record: we basically want the most distant possible from current
    let minBlock = current ? current.number - 30 : 0;
    if (p1) {
      // But if already have a peer record within this distance, we need to take the next block of it
      minBlock = Math.max(minBlock, parseInt(p1.block.split('-')[0], 10) + 1);
    }
    // The number cannot be superior to current block
    minBlock = Math.min(minBlock, current ? current.number : minBlock);
    let targetBlock = yield server.dal.getBlock(minBlock);
    const p2 = {
      version: constants.DOCUMENTS_VERSION,
      currency: currency,
      pubkey: selfPubkey,
      block: targetBlock ? [targetBlock.number, targetBlock.hash].join('-') : constants.PEER.SPECIAL_BLOCK,
      endpoints: _.uniq([endpoint].concat(toConserve).concat(conf.endpoints || []))
    };
    const raw2 = dos2unix(new Peer(p2).getRaw());
    logger.info('External access:', new Peer(p2).getURL());
    logger.debug('Generating server\'s peering entry based on block#%s...', p2.block.split('-')[0]);
    p2.signature = yield server.sign(raw2);
    p2.pubkey = selfPubkey;
    p2.documentType = 'peer';
    // Remember this is now local peer value
    peer = p2;
    // Submit & share with the network
    yield server.submitP(p2, false);
    const selfPeer = yield dal.getPeer(selfPubkey);
    // Set peer's statut to UP
    selfPeer.documentType = 'selfPeer';
    yield that.peer(selfPeer);
    server.streamPush(selfPeer);
    logger.info("Next peering signal in %s min", signalTimeInterval / 1000 / 60);
    return selfPeer;
  });

  function getOtherEndpoints(endpoints, theConf) {
    return endpoints.filter((ep) => {
      return !ep.match(constants.BMA_REGEXP) || (
          !(ep.includes(' ' + theConf.remoteport) && (
          ep.includes(theConf.remotehost) || ep.includes(theConf.remoteipv6) || ep.includes(theConf.remoteipv4))));
    });
  }
}

util.inherits(PeeringService, events.EventEmitter);

module.exports = function (server, pair, dal) {
  return new PeeringService(server, pair, dal);
};

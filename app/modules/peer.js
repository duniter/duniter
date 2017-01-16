"use strict";

const Q = require('q');
const co = require('co');
const multicaster = require('../lib/streams/multicaster');
const contacter = require('../lib/contacter');
const Peer = require('../lib/entity/peer');

const ERASE_IF_ALREADY_RECORDED = true;

module.exports = {
  duniter: {
    cli: [{
      name: 'peer [host] [port]',
      desc: 'Exchange peerings with another node',
      onPluggedDALExecute: (server, conf, program, params) => co(function*() {
        const host = params[0];
        const port = params[1];
        const logger = server.logger;
        try {
          logger.info('Fetching peering record at %s:%s...', host, port);
          let peering = yield contacter.statics.fetchPeer(host, port);
          logger.info('Apply peering ...');
          yield server.PeeringService.submitP(peering, ERASE_IF_ALREADY_RECORDED, !program.nocautious);
          logger.info('Applied');
          let selfPeer = yield server.dal.getPeer(server.PeeringService.pubkey);
          if (!selfPeer) {
            yield Q.nfcall(server.PeeringService.generateSelfPeer, server.conf, 0);
            selfPeer = yield server.dal.getPeer(server.PeeringService.pubkey);
          }
          logger.info('Send self peering ...');
          const caster = multicaster();
          yield caster.sendPeering(Peer.statics.peerize(peering), Peer.statics.peerize(selfPeer));
          logger.info('Sent.');
          yield server.disconnect();
        } catch(e) {
          logger.error(e.code || e.message || e);
          throw Error("Exiting");
        }
      })
    }]
  }
}

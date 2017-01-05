"use strict";

const co               = require('co');
const _                = require('underscore');
const rules            = require('../lib/rules');
const constants        = require('../lib/constants');
const http2raw         = require('../lib/helpers/http2raw');
const Membership       = require('../lib/entity/membership');
const AbstractController = require('./abstract');

module.exports = function (server) {
  return new BlockchainBinding(server);
};

function BlockchainBinding (server) {

  AbstractController.call(this, server);

  const conf = server.conf;

  // Services
  const ParametersService = server.ParametersService;
  const BlockchainService = server.BlockchainService;
  const IdentityService   = server.IdentityService;

  // Models
  const Block      = require('../lib/entity/block');
  const Stat       = require('../lib/entity/stat');

  this.parseMembership = (req) => this.pushEntity(req, http2raw.membership, constants.ENTITY_MEMBERSHIP);

  this.parseBlock = (req) => this.pushEntity(req, http2raw.block, constants.ENTITY_BLOCK);

  this.parameters = () => server.dal.getParameters();

  this.with = {

    newcomers: getStat('newcomers'),
    certs:     getStat('certs'),
    joiners:   getStat('joiners'),
    actives:   getStat('actives'),
    leavers:   getStat('leavers'),
    revoked:  getStat('revoked'),
    excluded:  getStat('excluded'),
    ud:        getStat('ud'),
    tx:        getStat('tx')
  };

  function getStat (statName) {
    return () => co(function *() {
      let stat = yield server.dal.getStat(statName);
      return { result: new Stat(stat).json() };
    });
  }

  this.promoted = (req) => co(function *() {
    const number = yield ParametersService.getNumberP(req);
    const promoted = yield BlockchainService.promoted(number);
    return new Block(promoted).json();
  });

  this.blocks = (req) => co(function *() {
    const params = ParametersService.getCountAndFrom(req);
    const count = parseInt(params.count);
    const from = parseInt(params.from);
    let blocks = yield BlockchainService.blocksBetween(from, count);
    blocks = blocks.map((b) => (new Block(b).json()));
    return blocks;
  });

  this.current = () => co(function *() {
    const current = yield server.dal.getCurrentBlockOrNull();
    if (!current) throw constants.ERRORS.NO_CURRENT_BLOCK;
    return new Block(current).json();
  });

  this.hardship = (req) => co(function *() {
    let nextBlockNumber = 0;
    const search = yield ParametersService.getSearchP(req);
    const idty = yield IdentityService.findMemberWithoutMemberships(search);
    if (!idty) {
      throw constants.ERRORS.NO_MATCHING_IDENTITY;
    }
    if (!idty.member) {
      throw constants.ERRORS.NOT_A_MEMBER;
    }
    const current = yield BlockchainService.current();
    if (current) {
      nextBlockNumber = current ? current.number + 1 : 0;
    }
    const difficulty = yield server.getBcContext().getIssuerPersonalizedDifficulty(idty.pubkey);
    return {
      "block": nextBlockNumber,
      "level": difficulty
    };
  });

  this.difficulties = () => co(function *() {
    const current = yield server.dal.getCurrentBlockOrNull();
    const number = (current && current.number) || 0;
    const issuers = yield server.dal.getUniqueIssuersBetween(number - 1 - conf.blocksRot, number - 1);
    const difficulties = [];
    for (const issuer of issuers) {
      const member = yield server.dal.getWrittenIdtyByPubkey(issuer);
      const difficulty = yield server.getBcContext().getIssuerPersonalizedDifficulty(member.pubkey);
      difficulties.push({
        uid: member.uid,
        level: difficulty
      });
    }
    return {
      "block": number + 1,
      "levels": _.sortBy(difficulties, (diff) => diff.level)
    };
  });

  this.memberships = (req) => co(function *() {
    const search = yield ParametersService.getSearchP(req);
    const idty = yield IdentityService.findMember(search);
    const json = {
      pubkey: idty.pubkey,
      uid: idty.uid,
      sigDate: idty.buid,
      memberships: []
    };
    json.memberships = idty.memberships.map((msObj) => {
      const ms = new Membership(msObj);
      return {
        version: ms.version,
        currency: conf.currency,
        membership: ms.membership,
        blockNumber: parseInt(ms.blockNumber),
        blockHash: ms.blockHash,
        written: (!ms.written_number && ms.written_number !== 0) ? null : ms.written_number
      };
    });
    json.memberships = _.sortBy(json.memberships, 'blockNumber');
    json.memberships.reverse();
    return json;
  });

  this.branches = () => co(function *() {
    const branches = yield BlockchainService.branches();
    const blocks = branches.map((b) => new Block(b).json());
    return {
      blocks: blocks
    };
  });
}

"use strict";

var co               = require('co');
var _                = require('underscore');
var rules            = require('../lib/rules');
var constants        = require('../lib/constants');
var http2raw         = require('../lib/streams/parsers/http2raw');
var Membership       = require('../lib/entity/membership');
var AbstractController = require('./abstract');

module.exports = function (server) {
  return new BlockchainBinding(server);
};

function BlockchainBinding (server) {

  AbstractController.call(this, server);

  var conf = server.conf;

  // Services
  var ParametersService = server.ParametersService;
  var BlockchainService = server.BlockchainService;
  var IdentityService   = server.IdentityService;

  // Models
  var Block      = require('../lib/entity/block');
  var Stat       = require('../lib/entity/stat');

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
    let number = yield ParametersService.getNumberP(req);
    let promoted = yield BlockchainService.promoted(number);
    return new Block(promoted).json();
  });

  this.blocks = (req) => co(function *() {
    let params = ParametersService.getCountAndFrom(req);
    var count = parseInt(params.count);
    var from = parseInt(params.from);
    let blocks = yield BlockchainService.blocksBetween(from, count);
    blocks = blocks.map((b) => (new Block(b).json()));
    return blocks;
  });

  this.current = () => co(function *() {
    let current = yield server.dal.getCurrentBlockOrNull();
    if (!current) throw constants.ERRORS.NO_CURRENT_BLOCK;
    return new Block(current).json();
  });

  this.hardship = (req) => co(function *() {
    let nextBlockNumber = 0;
    let search = yield ParametersService.getSearchP(req);
    let idty = yield IdentityService.findMemberWithoutMemberships(search);
    if (!idty) {
      throw constants.ERRORS.NO_MATCHING_IDENTITY;
    }
    if (!idty.member) {
      throw constants.ERRORS.NOT_A_MEMBER;
    }
    let current = yield BlockchainService.current();
    if (current) {
      nextBlockNumber = current ? current.number + 1 : 0;
    }
    let difficulty = yield rules.HELPERS.getTrialLevel(idty.pubkey, conf, server.dal);
    return {
      "block": nextBlockNumber,
      "level": difficulty
    };
  });

  this.difficulties = () => co(function *() {
    let current = yield server.dal.getCurrent();
    let number = (current && current.number) || 0;
    let issuers = yield server.dal.getUniqueIssuersBetween(number - 1 - conf.blocksRot, number - 1);
    let difficulties = [];
    for (let i = 0, len = issuers.length; i < len; i++) {
      let issuer = issuers[i];
      let member = yield server.dal.getWrittenIdtyByPubkey(issuer);
      let difficulty = yield rules.HELPERS.getTrialLevel(member.pubkey, conf, server.dal);
      difficulties.push({
        uid: member.uid,
        level: difficulty
      });
    }
    return {
      "block": number + 1,
      "levels": difficulties
    };
  });

  this.memberships = (req) => co(function *() {
    let search = yield ParametersService.getSearchP(req);
    let idty = yield IdentityService.findMember(search);
    var json = {
      pubkey: idty.pubkey,
      uid: idty.uid,
      sigDate: idty.buid,
      memberships: []
    };
    json.memberships = idty.memberships.map((msObj) => {
      let ms = new Membership(msObj);
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
    let branches = yield BlockchainService.branches();
    let blocks = branches.map((b) => new Block(b).json());
    return {
      blocks: blocks
    };
  });
}

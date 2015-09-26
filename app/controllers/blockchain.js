"use strict";

var _                = require('underscore');
var Q                = require('q');
var async            = require('async');
var es               = require('event-stream');
var moment           = require('moment');
var dos2unix         = require('../lib/dos2unix');
var http2raw         = require('../lib/streams/parsers/http2raw');
var jsoner           = require('../lib/streams/jsoner');
var http400          = require('../lib/http/http400');
var parsers          = require('../lib/streams/parsers/doc');
var blockchainDao    = require('../lib/blockchainDao');
var localValidator   = require('../lib/localValidator');
var globalValidator  = require('../lib/globalValidator');
var Membership       = require('../lib/entity/membership');

module.exports = function (server) {
  return new BlockchainBinding(server);
};

function BlockchainBinding (server) {

  var conf = server.conf;
  var local = localValidator(conf);
  var global = globalValidator(conf);

  // Services
  var ParametersService = server.ParametersService;
  var BlockchainService = server.BlockchainService;
  var IdentityService   = server.IdentityService;

  // Models
  var Block      = require('../lib/entity/block');
  var Stat       = require('../lib/entity/stat');

  this.parseMembership = function (req, res) {
    res.type('application/json');
    var onError = http400(res);
    http2raw.membership(req, onError)
      .pipe(dos2unix())
      .pipe(parsers.parseMembership(onError))
      .pipe(local.versionFilter(onError))
      .pipe(global.currencyFilter(onError))
      .pipe(server.singleWriteStream(onError))
      .pipe(jsoner())
      .pipe(es.stringify())
      .pipe(res);
  };

  this.parseBlock = function (req, res) {
    res.type('application/json');
    var onError = http400(res);
    http2raw.block(req, onError)
      .pipe(dos2unix())
      .pipe(parsers.parseBlock(onError))
      .pipe(local.versionFilter(onError))
      .pipe(global.currencyFilter(onError))
      .pipe(server.singleWriteStream(onError))
      .pipe(jsoner())
      .pipe(es.stringify())
      .pipe(res);
  };

  this.parameters = function (req, res) {
    res.type('application/json');
    server.dal.getParameters()
      .then(function(parameters){
        res.send(200, JSON.stringify(parameters, null, "  "));
      })
      .catch(function(){
        res.send(200, JSON.stringify({}, null, "  "));
      })
  };

  this.with = {

    newcomers: getStat('newcomers'),
    certs:     getStat('certs'),
    joiners:   getStat('joiners'),
    actives:   getStat('actives'),
    leavers:   getStat('leavers'),
    excluded:  getStat('excluded'),
    ud:        getStat('ud'),
    tx:        getStat('tx')
  };

  function getStat (statName) {
    return function (req, res) {
      async.waterfall([
        function (next) {
          server.dal.getStat(statName).then(_.partial(next, null)).catch(next);
        }
      ], function (err, stat) {
        if(err){
          res.send(400, err);
          return;
        }
        res.type('application/json');
        res.send(200, JSON.stringify({ result: new Stat(stat).json() }, null, "  "));
      });
    }
  }

  this.promoted = function (req, res) {
    res.type('application/json');
    async.waterfall([
      function (next){
        ParametersService.getNumber(req, next);
      },
      function (number, next){
        BlockchainService.promoted(number, next);
      }
    ], function (err, promoted) {
      if(err){
        res.send(404, err && (err.message || err));
        return;
      }
      res.send(200, JSON.stringify(new Block(promoted).json(), null, "  "));
    });
  };

  this.blocks = function (req, res) {
    res.type('application/json');
    async.waterfall([
      function (next){
        async.parallel({
          params: async.apply(ParametersService.getCountAndFrom, req),
          current: async.apply(BlockchainService.current)
        }, next);
      },
      function (res, next){
        var current = res.current;
        var count = parseInt(res.params[0]);
        var from = parseInt(res.params[1]);
        if (count > 5000) {
          next('Count is too high');
          return;
        }
        if (!current || current.number < from) {
          next('Starting block #' + from + ' does not exist');
          return;
        }
        count = Math.min(current.number - from + 1, count);
        var blocks = [];
        var i = from;
        async.whilst(
          function(){ return i < from + count; },
          function (next) {
            async.waterfall([
              function (next){
                BlockchainService.promoted(i, next);
              },
              function (block, next){
                blocks.push(new Block(block).json());
                i++;
                next();
              }
            ], next);
          }, function (err) {
            next(err, blocks);
          });
      }
    ], function (err, blocks) {
      if(err){
        res.send(400, err);
        return;
      }
      res.send(200, JSON.stringify(blocks, null, "  "));
    });
  };

  this.current = function (req, res) {
    res.type('application/json');
    async.waterfall([
      function (next){
        BlockchainService.current(next);
      }
    ], function (err, current) {
      if(err || !current){
        res.send(404, err);
        return;
      }
      res.send(200, JSON.stringify(new Block(current).json(), null, "  "));
    });
  };

  this.hardship = function (req, res) {
    res.type('application/json');
    var member = "";
    var nextBlockNumber = 0;
    async.waterfall([
      function (next){
        ParametersService.getPubkey(req, next);
      },
      function (pubkey, next){
        member = pubkey;
        server.dal.isMember(pubkey, next);
      },
      function (isMember, next){
        if (!isMember)
          next('Not a member');
        else
          BlockchainService.current(next);
      },
      function (current, next){
        if (current) {
          nextBlockNumber = current ? current.number + 1 : 0;
        }
        globalValidator(conf, blockchainDao(null, server.dal)).getTrialLevel(member, next);
      }
    ], function (err, nbZeros) {
      if(err){
        res.send(404, err);
        return;
      }
      res.send(200, JSON.stringify({
        "block": nextBlockNumber,
        "level": nbZeros
      }, null, "  "));
    });
  };

  this.memberships = function (req, res) {
    res.type('application/json');
    async.waterfall([
      function (next){
        ParametersService.getSearch(req, next);
      },
      function (search, next){
        IdentityService.findMember(search, next);
      }
    ], function (err, idty) {
      if(err){
        res.send(400, err);
        return;
      }
      var json = {
        pubkey: idty.pubkey,
        uid: idty.uid,
        sigDate: moment(idty.time).unix(),
        memberships: []
      };
      idty.memberships.forEach(function(ms){
        ms = new Membership(ms);
        json.memberships.push({
          version: ms.version,
          currency: conf.currency,
          membership: ms.membership,
          blockNumber: ms.blockNumber,
          blockHash: ms.blockHash
        });
      });
      res.send(200, JSON.stringify(json, null, "  "));
    });
  };

  this.branches = function (req, res) {
    res.type('application/json');
    BlockchainService.branches()
      .then(function(cores){
        return Q.all(cores.map(function(core) {
          return core.current()
            .then(function(current){
              return new Block(current).json();
            });
        }));
      })
      .then(function(blocks){
        res.send(200, JSON.stringify({
          blocks: blocks
        }, null, "  "));
      })
      .catch(function(err){
        res.send(404, err && (err.message || err));
      });
  };
}

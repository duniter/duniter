var async            = require('async');
var _                = require('underscore');
var es               = require('event-stream');
var dos2unix         = require('../lib/dos2unix');
var versionFilter    = require('../lib/streams/versionFilter');
var currencyFilter   = require('../lib/streams/currencyFilter');
var http2raw         = require('../lib/streams/parsers/http2raw');
var jsoner           = require('../lib/streams/jsoner');
var http400          = require('../lib/http/http400');
var parsers          = require('../lib/streams/parsers/doc');
var extractSignature = require('../lib/streams/extractSignature');
var verifySignature  = require('../lib/streams/verifySignature');
var logger           = require('../lib/logger')();
var mlogger          = require('../lib/logger')('membership');
var blockchainDao    = require('../lib/blockchainDao');
var globalValidator  = require('../lib/globalValidator');

module.exports = function (wotServer) {
  return new BlockchainBinding(wotServer);
}

function BlockchainBinding (wotServer) {

  var that = this;
  var conf = wotServer.conf;
  var conn = wotServer.conn;

  // Services
  var http              = wotServer.HTTPService;
  var ParametersService = wotServer.ParametersService;
  var PeeringService    = wotServer.PeeringService;
  var BlockchainService = wotServer.BlockchainService;
  var IdentityService   = wotServer.IdentityService;

  // Models
  var Block      = require('../lib/entity/block');
  var Peer       = wotServer.conn.model('Peer');
  var BlockStat  = wotServer.conn.model('BlockStat');

  this.parseMembership = function (req, res) {
    res.type('application/json');
    var onError = http400(res);
    http2raw.membership(req, onError)
      .pipe(dos2unix())
      .pipe(parsers.parseMembership(onError))
      .pipe(versionFilter(onError))
      .pipe(currencyFilter(conf.currency, onError))
      // .pipe(extractSignature(onError))
      // .pipe(verifySignature(onError))
      .pipe(wotServer.singleWriteStream(onError))
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
      .pipe(versionFilter(onError))
      .pipe(currencyFilter(conf.currency, onError))
      // .pipe(extractSignature(onError))
      // .pipe(verifySignature(onError))
      .pipe(wotServer.singleWriteStream(onError))
      .pipe(jsoner())
      .pipe(es.stringify())
      .pipe(res);
  }

  this.parameters = function (req, res) {
    res.type('application/json');
    res.send(200, JSON.stringify({
      "currency": conf.currency,
      "c": conf.c,
      "dt": conf.dt,
      "ud0": conf.ud0,
      "sigDelay": conf.sigDelay,
      "sigValidity": conf.sigValidity,
      "sigQty": conf.sigQty,
      "sigWoT": conf.sigWoT,
      "msValidity": conf.msValidity,
      "stepMax": 3, // uCoin only handles 3 step currencies for now
      "medianTimeBlocks": conf.medianTimeBlocks,
      "avgGenTime": conf.avgGenTime,
      "dtDiffEval": conf.dtDiffEval,
      "blocksRot": conf.blocksRot,
      "percentRot": conf.percentRot,
    }, null, "  "));
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
          BlockStat.getStat(statName, next);
        }
      ], function (err, stat) {
        if(err){
          res.send(400, err);
          return;
        }
        if (stat == null) {
          stat = new BlockStat();
        }
        res.type('application/json');
        res.send(200, JSON.stringify({ result: stat.json() }, null, "  "));
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
        res.send(400, err);
        return;
      }
      res.send(200, JSON.stringify(new Block(promoted).json(), null, "  "));
    });
  }

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
              },
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
  }

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
  }

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
        wotServer.dal.isMember(pubkey, next);
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
        globalValidator(conf, blockchainDao(conn, null, server.dal)).getTrialLevel(member, next);
      },
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
      },
    ], function (err, idty) {
      if(err){
        res.send(400, err);
        return;
      }
      var json = {
        pubkey: idty.pubkey,
        uid: idty.uid,
        sigDate: idty.time.timestamp(),
        memberships: []
      };
      idty.memberships.forEach(function(ms){
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
}

"use strict";
var async            = require('async');
var _                = require('underscore');
var es               = require('event-stream');
var jsoner           = require('../lib/streams/jsoner');
var dos2unix         = require('../lib/dos2unix');
var localValidator   = require('../lib/localValidator');
var globalValidator  = require('../lib/globalValidator');
var http2raw         = require('../lib/streams/parsers/http2raw');
var http400          = require('../lib/http/http400');
var parsers          = require('../lib/streams/parsers/doc');
var logger           = require('../lib/logger')('transaction');
var Transaction      = require('../lib/entity/transaction');

module.exports = function (server) {
  return new TransactionBinding(server);
};

function TransactionBinding(server) {

  var conf = server.conf;
  var local = localValidator(conf);
  var global = globalValidator(conf);

  // Services
  var ParametersService = server.ParametersService;

  // Models
  var Source = require('../lib/entity/source');

  this.parseTransaction = function (req, res) {
    res.type('application/json');
    var onError = http400(res);
    http2raw.transaction(req, onError)
      .pipe(dos2unix())
      .pipe(parsers.parseTransaction(onError))
      .pipe(local.versionFilter(onError))
      .pipe(global.currencyFilter(onError))
      .pipe(server.singleWriteStream(onError))
      .pipe(jsoner())
      .pipe(es.stringify())
      .pipe(res);
  };

  this.getSources = function (req, res) {
    res.type('application/json');
    var pubkey = "";
    async.waterfall([
      function (next) {
        ParametersService.getPubkey(req, next);
      },
      function (pPubkey, next) {
        pubkey = pPubkey;
        server.dal.getAvailableSourcesByPubkey(pubkey).then(_.partial(next, null)).catch(next);
      },
      function (sources, next) {
        var result = {
          "currency": conf.currency,
          "pubkey": pubkey,
          "sources": []
        };
        sources.forEach(function (src) {
          result.sources.push(new Source(src).json());
        });
        next(null, result);
      }
    ], function (err, result) {
      if (err) {
        res.send(500, err);
      } else {
        res.send(200, JSON.stringify(result, null, "  "));
      }
    });
  };

  this.getHistory = function (req, res) {
    res.type('application/json');
    async.waterfall([
      function (next) {
        ParametersService.getPubkey(req, next);
      },
      function (pubkey, next) {
        getHistory(pubkey, function(results) {
          return results;
        }, next);
      }
    ], function (err, result) {
      if (err) {
        res.send(500, err);
      } else {
        res.send(200, JSON.stringify(result, null, "  "));
      }
    });
  };

  this.getHistoryBetweenBlocks = function (req, res) {
    res.type('application/json');
    async.waterfall([
      function (next) {
        async.parallel({
          pubkey: ParametersService.getPubkey.bind(ParametersService, req),
          from:   ParametersService.getFrom.bind(ParametersService, req),
          to:     ParametersService.getTo.bind(ParametersService, req)
        }, next);
      },
      function (res, next) {
        var pubkey = res.pubkey, from = res.from, to = res.to;
        getHistory(pubkey, function(res) {
          var histo = res.history;
          histo.sent =     _.filter(histo.sent, function(tx){ return tx && tx.block_number >= from && tx.block_number <= to; });
          histo.received = _.filter(histo.received, function(tx){ return tx && tx.block_number >= from && tx.block_number <= to; });
          _.extend(histo, { sending: [], receiving: [] });
          return res;
        }, next);
      }
    ], function (err, result) {
      if (err) {
        res.send(500, err);
      } else {
        res.send(200, JSON.stringify(result, null, "  "));
      }
    });
  };

  this.getHistoryBetweenTimes = function (req, res) {
    res.type('application/json');
    async.waterfall([
      function (next) {
        async.parallel({
          pubkey: ParametersService.getPubkey.bind(ParametersService, req),
          from:   ParametersService.getFrom.bind(ParametersService, req),
          to:     ParametersService.getTo.bind(ParametersService, req)
        }, next);
      },
      function (res, next) {
        var pubkey = res.pubkey, from = res.from, to = res.to;
        getHistory(pubkey, function(res) {
          var histo = res.history;
          histo.sent =     _.filter(histo.sent, function(tx){ return tx && tx.time >= from && tx.time <= to; });
          histo.received = _.filter(histo.received, function(tx){ return tx && tx.time >= from && tx.time <= to; });
          _.extend(histo, { sending: [], receiving: [] });
          return res;
        }, next);
      }
    ], function (err, result) {
      if (err) {
        res.send(500, err);
      } else {
        res.send(200, JSON.stringify(result, null, "  "));
      }
    });
  };

  this.getPendingForPubkey = function (req, res) {
    res.type('application/json');
    async.waterfall([
      function (next) {
        async.parallel({
          pubkey: ParametersService.getPubkey.bind(ParametersService, req)
        }, next);
      },
      function (res, next) {
        var pubkey = res.pubkey;
        getHistory(pubkey, function(res) {
          var histo = res.history;
          _.extend(histo, { sent: [], received: [] });
          return res;
        }, next);
      }
    ], function (err, result) {
      if (err) {
        res.send(500, err);
      } else {
        res.send(200, JSON.stringify(result, null, "  "));
      }
    });
  };

  this.getPending = function (req, res) {
    res.type('application/json');
    async.waterfall([
      function (next) {
        getPending(next);
      }
    ], function (err, result) {
      if (err) {
        res.send(500, err);
      } else {
        res.send(200, JSON.stringify(result, null, "  "));
      }
    });
  };

  function getHistory(pubkey, filter, done) {
    async.waterfall([
      function (next) {
        server.dal.getTransactionsHistory(pubkey).then(_.partial(next, null)).catch(next);
      },
      function (history, next) {
        var result = {
          "currency": conf.currency,
          "pubkey": pubkey,
          "history": history
        };
        _.keys(history).map(function(key) {
          history[key].map(function (tx, index) {
            history[key][index] = _.omit(new Transaction(tx).json(), 'currency', 'raw');
            _.extend(history[key][index], { block_number: tx && tx.block_number, time: tx && tx.time });
          });
        });
        next(null, filter(result));
      }
    ], done);
  }

  function getPending(done) {
    server.dal.getTransactionsPending()
      .then(function(pending){
        var res = {
          "currency": conf.currency,
          "pending": pending
        };
        pending.map(function(tx, index) {
          pending[index] = _.omit(new Transaction(tx).json(), 'currency', 'raw');
        });
        done && done(null, res);
        return res;
      })
      .catch(function(err){
        done && done(err);
        throw err;
      });
  }
  
  return this;
}

var async            = require('async');
var _                = require('underscore');
var es               = require('event-stream');
var jsoner           = require('../lib/streams/jsoner');
var dos2unix         = require('../lib/dos2unix');
var versionFilter    = require('../lib/streams/versionFilter');
var currencyFilter   = require('../lib/streams/currencyFilter');
var http2raw         = require('../lib/streams/parsers/http2raw');
var http400          = require('../lib/http/http400');
var parsers          = require('../lib/streams/parsers/doc');
var link2pubkey      = require('../lib/streams/link2pubkey');
var extractSignature = require('../lib/streams/extractSignature');
var verifySignature  = require('../lib/streams/verifySignature');
var logger           = require('../lib/logger')('transaction');
var Transaction      = require('../lib/entity/transaction');

module.exports = function (txServer) {
  return new TransactionBinding(txServer);
};

function TransactionBinding(txServer) {

  var that = this;
  var conf = txServer.conf;

  // Services
  var ParametersService = txServer.ParametersService;
  var BlockchainService = txServer.BlockchainService;

  // Models
  var Source = require('../lib/entity/source');

  this.parseTransaction = function (req, res) {
    res.type('application/json');
    var onError = http400(res);
    http2raw.transaction(req, onError)
      .pipe(dos2unix())
      .pipe(parsers.parseTransaction(onError))
      .pipe(versionFilter(onError))
      .pipe(currencyFilter(conf.currency, onError))
      // .pipe(extractSignature(onError))
      // .pipe(verifySignature(onError))
      .pipe(txServer.singleWriteStream(onError))
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
        txServer.dal.getAvailableSourcesByPubkey(pubkey, next);
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
    var pubkey = "";
    async.waterfall([
      function (next) {
        ParametersService.getPubkey(req, next);
      },
      function (pPubkey, next) {
        pubkey = pPubkey;
        txServer.dal.getTransactionsHistory(pubkey, next);
      },
      function (history, next) {
        var result = {
          "currency": conf.currency,
          "pubkey": pubkey,
          "history": history
        };
        _.keys(history).map(function(key) {
          history[key].map(function (tx, index) {
            history[key][index] = _.omit(new Transaction(tx).json(), 'currency');
          });
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
  
  return this;
}

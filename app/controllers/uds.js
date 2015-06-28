"use strict";
var async            = require('async');
var _                = require('underscore');

module.exports = function (server) {
  return new UDBinding(server);
};

function UDBinding(server) {

  var conf = server.conf;

  // Services
  var ParametersService = server.ParametersService;

  // Models
  var Source = require('../lib/entity/source');

  this.getHistory = function (req, res) {
    res.type('application/json');
    async.waterfall([
      function (next) {
        ParametersService.getPubkey(req, next);
      },
      function (pubkey, next) {
        getUDSources(pubkey, function(results) {
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
      function (params, next) {
        var pubkey = params.pubkey, from = params.from, to = params.to;
        getUDSources(pubkey, function(results) {
          results.history.history = _.filter(results.history.history, function(ud){ return ud.block_number >= from && ud.block_number <= to; });
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
      function (params, next) {
        var pubkey = params.pubkey, from = params.from, to = params.to;
        getUDSources(pubkey, function(results) {
          results.history.history = _.filter(results.history.history, function(ud){ return ud.time >= from && ud.time <= to; });
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

  function getUDSources(pubkey, filter, done) {
    async.waterfall([
      function (next) {
        server.dal.getUDHistory(pubkey, next);
      },
      function (history, next) {
        var result = {
          "currency": conf.currency,
          "pubkey": pubkey,
          "history": history
        };
        _.keys(history).map(function(key) {
          history[key].map(function (src, index) {
            history[key][index] = _.omit(new Source(src).UDjson(), 'currency', 'raw');
            _.extend(history[key][index], { block_number: src && src.block_number, time: src && src.time });
          });
        });
        next(null, filter(result));
      }
    ], done);
  }
  
  return this;
}

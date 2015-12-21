"use strict";
var co = require('co');
var Q = require('q');
var _ = require('underscore');

module.exports = function (server) {
  return new UDBinding(server);
};

function UDBinding(server) {

  var conf = server.conf;

  // Services
  var ParametersService = server.ParametersService;

  // Models
  var Source = require('../lib/entity/source');

  this.getHistory = (req) => co(function *() {
    let pubkey = yield ParametersService.getPubkeyP(req);
    return getUDSources(pubkey, (results) => results);
  });

  this.getHistoryBetweenBlocks = (req) => co(function *() {
    let pubkey = yield ParametersService.getPubkeyP(req);
    let from = yield ParametersService.getFromP(req);
    let to = yield ParametersService.getToP(req);
    return getUDSources(pubkey, (results) => {
      results.history.history = _.filter(results.history.history, function(ud){ return ud.block_number >= from && ud.block_number <= to; });
      return results;
    });
  });

  this.getHistoryBetweenTimes = (req) => co(function *() {
    let pubkey = yield ParametersService.getPubkeyP(req);
    let from = yield ParametersService.getFromP(req);
    let to = yield ParametersService.getToP(req);
    return getUDSources(pubkey, (results) => {
      results.history.history = _.filter(results.history.history, function(ud){ return ud.time >= from && ud.time <= to; });
      return results;
    });
  });

  function getUDSources(pubkey, filter) {
    return co(function *() {
      let history = yield server.dal.getUDHistory(pubkey);
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
      return filter(result);
    });
  }
  
  return this;
}

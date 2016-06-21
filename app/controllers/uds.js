"use strict";
const co = require('co');
const Q = require('q');
const _ = require('underscore');

module.exports = function (server) {
  return new UDBinding(server);
};

function UDBinding(server) {

  const conf = server.conf;

  // Services
  const ParametersService = server.ParametersService;

  // Models
  const Source = require('../lib/entity/source');

  this.getHistory = (req) => co(function *() {
    const pubkey = yield ParametersService.getPubkeyP(req);
    return getUDSources(pubkey, (results) => results);
  });

  this.getHistoryBetweenBlocks = (req) => co(function *() {
    const pubkey = yield ParametersService.getPubkeyP(req);
    const from = yield ParametersService.getFromP(req);
    const to = yield ParametersService.getToP(req);
    return getUDSources(pubkey, (results) => {
      results.history.history = _.filter(results.history.history, function(ud){ return ud.block_number >= from && ud.block_number <= to; });
      return results;
    });
  });

  this.getHistoryBetweenTimes = (req) => co(function *() {
    const pubkey = yield ParametersService.getPubkeyP(req);
    const from = yield ParametersService.getFromP(req);
    const to = yield ParametersService.getToP(req);
    return getUDSources(pubkey, (results) => {
      results.history.history = _.filter(results.history.history, function(ud){ return ud.time >= from && ud.time <= to; });
      return results;
    });
  });

  function getUDSources(pubkey, filter) {
    return co(function *() {
      const history = yield server.dal.getUDHistory(pubkey);
      const result = {
        "currency": conf.currency,
        "pubkey": pubkey,
        "history": history
      };
      _.keys(history).map((key) => {
        history[key].map((src, index) => {
          history[key][index] = _.omit(new Source(src).UDjson(), 'currency', 'raw');
          _.extend(history[key][index], { block_number: src && src.block_number, time: src && src.time });
        });
      });
      return filter(result);
    });
  }
  
  return this;
}

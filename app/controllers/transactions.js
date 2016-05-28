"use strict";
var co               = require('co');
var Q                = require('q');
var async            = require('async');
var _                = require('underscore');
var http2raw         = require('../lib/streams/parsers/http2raw');
var Transaction      = require('../lib/entity/transaction');
var constants        = require('../lib/constants');
var AbstractController = require('./abstract');

module.exports = function (server) {
  return new TransactionBinding(server);
};

function TransactionBinding(server) {

  AbstractController.call(this, server);

  var conf = server.conf;

  // Services
  var ParametersService = server.ParametersService;

  // Models
  var Source = require('../lib/entity/source');

  let getHistoryP = (pubkey, filter) => Q.nbind(getHistory, this)(pubkey, filter);

  this.parseTransaction = (req) => this.pushEntity(req, http2raw.transaction, constants.ENTITY_TRANSACTION);

  this.getSources = (req) => co(function *() {
    let pubkey = yield ParametersService.getPubkeyP(req);
    let sources = yield server.dal.getAvailableSourcesByPubkey(pubkey);
    var result = {
      "currency": conf.currency,
      "pubkey": pubkey,
      "sources": []
    };
    sources.forEach(function (src) {
      result.sources.push(new Source(src).json());
    });
    return result;
  });

  this.getHistory = (req) => co(function *() {
    let pubkey = yield ParametersService.getPubkeyP(req);
    return getHistoryP(pubkey, (results) => results);
  });

  this.getHistoryBetweenBlocks = (req) => co(function *() {
    let pubkey = yield ParametersService.getPubkeyP(req);
    let from = yield ParametersService.getFromP(req);
    let to = yield ParametersService.getToP(req);
    return getHistoryP(pubkey, (res) => {
      var histo = res.history;
      histo.sent =     _.filter(histo.sent, function(tx){ return tx && tx.block_number >= from && tx.block_number <= to; });
      histo.received = _.filter(histo.received, function(tx){ return tx && tx.block_number >= from && tx.block_number <= to; });
      _.extend(histo, { sending: [], receiving: [] });
      return res;
    });
  });

  this.getHistoryBetweenTimes = (req) => co(function *() {
    let pubkey = yield ParametersService.getPubkeyP(req);
    let from = yield ParametersService.getFromP(req);
    let to = yield ParametersService.getToP(req);
    return getHistoryP(pubkey, (res) => {
      var histo = res.history;
      histo.sent =     _.filter(histo.sent, function(tx){ return tx && tx.time >= from && tx.time <= to; });
      histo.received = _.filter(histo.received, function(tx){ return tx && tx.time >= from && tx.time <= to; });
      _.extend(histo, { sending: [], receiving: [] });
      return res;
    });
  });

  this.getPendingForPubkey = (req) => co(function *() {
    let pubkey = yield ParametersService.getPubkeyP(req);
    return getHistoryP(pubkey, function(res) {
      var histo = res.history;
      _.extend(histo, { sent: [], received: [] });
      return res;
    });
  });

  this.getPending = (req) => co(function *() {
    let pending = yield server.dal.getTransactionsPending();
    let res = {
      "currency": conf.currency,
      "pending": pending
    };
    pending.map(function(tx, index) {
      pending[index] = _.omit(new Transaction(tx).json(), 'currency', 'raw');
    });
    return res;
  });

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

  return this;
}

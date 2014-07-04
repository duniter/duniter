var express    = require('express');
var request    = require('request');
var http       = require('http');
var fs         = require('fs');
var async      = require('async');
var path       = require('path');
var connectPgp = require('connect-pgp');
var _          = require('underscore');
var jpgp       = require('./jpgp');
var sha1       = require('sha1');
var vucoin     = require('vucoin');
var logger     = require('./logger')('daemon');

module.exports = function (regServer) {
  return new Daemon(regServer);
};

function Daemon (regServer) {

  var conn            = regServer.conn;
  var PeeringService  = regServer.PeeringService;
  var ContractService = regServer.ContractService;
  var SyncService     = regServer.SyncService;
  var Amendment       = conn.model('Amendment');
  var Key             = conn.model('Key');

  // self reference, private scope
  var daemon = this;

  var AMStart, AMFreq, Algorithm, enabled;
  var timeoutID, frequency;
  var asked = -1;
  var processing = false;
  var defaultTimeout = 10*60*1000;
  var selfFingerprint = "";

  // 20 seconds minimal waiting before asking for vote
  var voteMargin = 1*1000;

  this.init = function (conf, fingerprint) {
    AMStart = conf.sync.AMStart;
    AMFreq = conf.sync.AMFreq;
    Algorithm = conf.sync.Algorithm;
    enabled = conf.sync.AMDaemon == "ON";
    selfFingerprint = fingerprint;
  };

  this.nextIn = function (timeout) {
    if (enabled) {
      timeout = Math.max(0, timeout);
      logger.debug("Daemon is asked to process in %ss", timeout/1000);
      if (!processing) {
        process(timeout, process);
      } else {
        asked = timeout;
      }
    }
  };

  this.start = function () {
    if (enabled) {
      if (!AMStart || !AMFreq) {
        throw new Error("Daemon not initialized.");
      }
      logger.debug("Daemon started.");
      daemon.nextIn(0);
    }
  };

  function process (timeout, done) {
    logger.debug("Daemon will process in %ss", timeout/1000);
    clearTimeout(timeoutID);
    processing = false;
    timeoutID = setTimeout(function () {
      processing = true;
      doStuff(function (err, wouldWait) {
        if (err)
          logger.error(err);
        var delay = wouldWait;
        if (asked >= 0) {
          delay = Math.min(delay, asked);
          asked = -1;
        }
        done(delay, process);
      });
    }, timeout);
  }

  var lastTried = 0;

  function doStuff (done) {
    var now = new Date().timestamp();
    var current = ContractService.current();
    async.waterfall([
      function (next){
        // Asking votes for next
        if (current && now > current.generated + AMFreq) {
          var amNext = new Amendment({ generated: current.generated + AMFreq });
          async.auto({
            triggerSelfCFlow: function(callback){
              // Case 1: just triggers self-vote
              if (daemon.judges.timeForVote(amNext) && lastTried != amNext.generated) {
                lastTried = amNext.generated;
                // Must be a voter to vote!
                Key.wasVoter(selfFingerprint, current.number, function (err, wasVoter) {
                  if (!err && wasVoter) {
                    logger.debug("Asking Statement for SELF peer");
                    async.forEach(Algorithm, function(algo, callback){
                      async.waterfall([
                        function (next){
                          SyncService.getStatement(current.number + 1, algo, next);
                        },
                        function (statement, next){
                          regServer.submit(statement, false, next);
                        },
                      ], callback);
                    }, function(err){
                      next(err);
                    });
                    return;
                  }
                  callback(err);
                });
                return;
              }
              callback();
            },
          }, function (err) {
            next(err);
          });
        }
        else {
          if (current) {
            var nextTime = new Date();
            nextTime.setTime((current.generated + AMFreq)*1000);
            logger.debug("Next amendment on " + nextTime.toLocaleString());
            next(null, (nextTime.timestamp() + voteMargin/1000 - now)*1000);
            return;
          }
          next();
        }
      },
    ], function (err, waiting) {
      done(err, waiting || defaultTimeout);
    });
  }

  this.stop = function () {
    clearTimeout(timeoutID);
  };

  this.judges = {

    timeForVote: function (amNext) {
      return new Date().utc().timestamp() >= amNext.generated;
    },

    timeForAskingVotes: function (amNext) {
      return new Date().utc().timestamp() >= amNext.generated + 60; // 1min later
    }
  };
}
var express    = require('express');
var request    = require('request');
var http       = require('http');
var fs         = require('fs');
var async      = require('async');
var path       = require('path');
var mongoose   = require('mongoose');
var Amendment  = mongoose.model('Amendment');
var Key        = mongoose.model('Key');
var connectPgp = require('connect-pgp');
var _          = require('underscore');
var service    = require('../service');
var jpgp       = require('./jpgp');
var sha1       = require('sha1');
var vucoin     = require('vucoin');
var logger     = require('./logger')('daemon');

module.exports = new Daemon();

function Daemon () {

  // Services
  var PeeringService  = service.Peering;
  var ContractService = service.Contract;
  
  // self reference, private scope
  var daemon = this;

  var AMStart, AMFreq, enabled;
  var timeoutID, frequency;
  var asked = -1;
  var processing = false;
  var defaultTimeout = 5*1000;
  var selfFingerprint = "";

  // 20 seconds minimal waiting before asking for vote
  var voteMargin = 20*1000;

  this.init = function (conf, fingerprint) {
    AMStart = conf.sync.AMStart;
    AMFreq = conf.sync.AMFreq;
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
    // logger.debug("Daemon will process in %ss", timeout/1000);
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

  function doStuff (done) {
    var now = new Date().timestamp();
    var current = ContractService.current();
    async.waterfall([
      function (next){
        // Asking votes for next
        if (current && now > current.generated + AMFreq) {
          var amNext = new Amendment({ generated: current.generated + AMFreq });
          async.auto({
            triggerSelfVote: function(callback){
              // Case 1: just triggers self-vote
              if (daemon.judges.timeForVote(amNext)) {
                // Must be a voter to vote!
                Key.wasVoter(selfFingerprint, current.number, function (err, wasVoter) {
                  if (!err && wasVoter) {
                    logger.debug("Asking vote for SELF peer");
                    askVote(current, PeeringService.peer(), function (err, json) {
                      // Do nothing with result: it has been done by SyncService (self-submitted the vote)
                      callback(err);
                    });
                    return;
                  }
                  callback(err);
                });
                return;
              }
              callback();
            },
            triggerPeersVote: ['triggerSelfVote', function(callback){
              if (daemon.judges.timeForAskingVotes(amNext)) {
                // Case 2: triggers other peers' self-vote
                async.forEach(PeeringService.upPeers(), function(peer, callback){
                  if (peer.fingerprint == selfFingerprint) {
                    callback();
                    return;
                  }
                  logger.debug("Asking vote for peer 0x%s", peer.fingerprint.substring(32));
                  // Must be a voter to vote!
                  Key.wasVoter(peer.fingerprint, current.number, function (err, wasVoter) {
                    if (!err && wasVoter) {
                      async.waterfall([
                        function (next){
                          askVote(current, peer, next);
                        },
                        function (json, next){
                          vucoin(peer.getIPv4(), peer.getPort(), true, function (err, node) {
                            next(null, json, node);
                          });
                        },
                        function (json, node, next){
                          var raw = json.amendment.raw;
                          var sig = json.signature;
                          node.hdc.amendments.votes.post(raw + sig, next);
                        },
                      ], function (err) {
                        callback(err);
                      });
                      return;
                    }
                    callback(err);
                  });
                }, next);
                return;
              }
              callback();
            }],
          }, next);
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

  function askVote (current, peer, done) {
    async.auto({
      connect: function (cb){
        vucoin(peer.getIPv4(), peer.getPort(), true, cb);
      },
      vote: ['connect', function (cb, results) {
        var node = results.connect;
        // Ask for peer's vote
        node.ucs.amendment.vote(current.number + 1, cb);
      }]
    }, function (err, results) {
      done(err, results.vote);
    });
  }

  this.stop = function () {
    clearTimeout(timeoutID);
  };

  this.judges = {

    timeForVote: function (amNext) {
      return new Date().timestamp() >= amNext.generated;
    },

    timeForAskingVotes: function (amNext) {
      return new Date().timestamp() >= amNext.generated + 60; // 1min later
    }
  };
}
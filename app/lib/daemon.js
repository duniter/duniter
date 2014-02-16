var express    = require('express');
var request    = require('request');
var http       = require('http');
var fs         = require('fs');
var async      = require('async');
var path       = require('path');
var mongoose   = require('mongoose');
var connectPgp = require('connect-pgp');
var _          = require('underscore');
var service    = require('../service');
var jpgp       = require('./jpgp');
var sha1       = require('sha1');
var vucoin     = require('vucoin');
var log4js     = require('log4js');
var logger     = require('./logger')('daemon');

module.exports = new Daemon();

function Daemon () {

  // Services
  var PeeringService  = service.Peering;
  var ContractService = service.Contract;
  
  var AMStart, AMFreq, enabled;
  var timeoutID, frequency;
  var asked = -1;
  var processing = false;
  var defaultTimeout = 5*1000;

  // 20 seconds minimal waiting before asking for vote
  var voteMargin = 20*1000;

  this.init = function (conf) {
    AMStart = conf.sync.AMStart;
    AMFreq = conf.sync.AMFreq;
    enabled = conf.sync.AMDaemon == "ON";
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
      this.nextIn(0);
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
          // logger.debug("New amendment shall be promoted");
          async.forEach(PeeringService.upPeers(), function(peer, callback){
            async.auto({
              connect: function (cb){
                vucoin(peer.getIPv4(), peer.getPort(), true, cb);
              },
              vote: ['connect', function (cb, results) {
                var node = results.connect;
                async.waterfall([
                  function (next){
                    node.ucs.amendment.vote(current.number + 1, next);
                  },
                  function (json, next){
                    var raw = json.amendment.raw;
                    var sig = json.signature;
                    node.hdc.amendments.votes.post(raw + sig, next);
                  },
                ], function (err) {
                  cb(err);
                });
              }]
            }, callback);
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

  this.stop = function () {
    clearTimeout(timeoutID);
  };
}
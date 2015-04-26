var async       = require('async');
var _           = require('underscore');
var vucoin      = require('vucoin');
var Q           = require('q');
var multicaster = require('../app/lib/streams/multicaster');
var logger      = require('../app/lib/logger')('webapp');
var signature   = require('../app/lib/signature');
var crypto      = require('../app/lib/crypto');
var base58      = require('../app/lib/base58');
var constants   = require('../app/lib/constants');
var ucoin       = require('./../index');
var webapp      = require('../web/app');
var Stat    = require('../app/lib/entity/stat');
var stream  = require('stream');
var util    = require('util');
var request = require('request');

module.exports = function (conf, mdb, autoStart) {
  return new ServerHandler(conf, mdb, autoStart);
};

/**
 * Utility stream that generates data events depending on its state.
 * @param cliConf Configuration given by the CLI.
 * @param mdb Database to use.
 * @param autoStart Flag: if true, automatically start the inner ucoin node process.
 * @constructor
 */
function ServerHandler(cliConf, mdb, autoStart) {

  stream.Transform.call(this, { objectMode: true });

  var that = this;
  var theServer = ucoin.createTxServer({ name: mdb || "ucoin_default" }, cliConf);

  // We get notified of server events
  theServer.pipe(that);
  theServer.on('BMAFailed', error.bind(null, 'Could not bind BMA API'));
  theServer.on('BMAFailed', status.bind(null, 'DOWN'));
  theServer.on('started',   status.bind(null, 'UP'));
  theServer.on('stopped',   status.bind(null, 'DOWN'));
  theServer.on('block',     setAsCurrentBlock);

  // Start
  if (autoStart) {
    getReadyServer()
      .then(function(){
        theServer.start();
      });
  }

  this._write = function (obj, enc, done) {
    that.push(obj);
    done();
  };

  this.start = function() {
    return getReadyServer()
      .then(function(){
        theServer.start();
      })
      .then(function(){
        return Q.nbind(theServer.dal.getBlockCurrent, theServer.dal)();
      })
      .then(setAsCurrentBlock);
  };

  this.stop = function() {
    return getReadyServer()
      .then(function(){
        return Q.nbind(theServer.BlockchainService.stopProof, theServer.BlockchainService)();
      })
      .then(function(){
        theServer.stop();
      });
  };

  this.restart = function() {
    return getReadyServer()
      .then(function(){
        theServer.stop();
        theServer.start();
      })
      .then(function(){
        return Q.nbind(theServer.dal.getBlockCurrent, theServer.dal)();
      })
      .then(setAsCurrentBlock);
  };

  this.reset = function() {
    return getReadyServer()
      .then(function(){
        return Q.nbind(theServer.reset, theServer)();
      })
      .then(function(){
        return Q.nbind(theServer.dal.getBlockCurrent, theServer.dal)();
      })
      .then(setAsCurrentBlock);
  };

  this.getPoWStats = function(done) {
    theServer.BlockchainService.getPoWProcessStats(done);
  };

  function error(errString) {
    that.push({ error: errString });
  }

  function status(st) {
    that.status = st;
    that.push({ status: st });
  }

  function setAsCurrentBlock(block) {
    that.current = block;
    that.push(block)
  }

  var readyServerPromise;
  function getReadyServer() {
    readyServerPromise = readyServerPromise || Q()
      .then(function(){
        return theServer.init();
      })
      .then(getHomeData)
      .then(function(overview){
        that.overview = overview;
      })
      .fail(function(err){
        error(err);
      });
    return readyServerPromise;
  }

  function getHomeData() {
    var auth = false;
    return Q.Promise(function(resolve, reject){
      var data = {
        membersActualizing: 0,
        membersJoining: 0,
        membersLeaving: 0,
        transactionsCount: 0,
        auth: auth
      };
      var that = this;


      this.knownPeers = function(done){
        theServer.dal.findAllPeersNEWUPBut([], done);
      };

      async.waterfall([
        function (next){
          theServer.dal.getPeer(theServer.PeeringService.pubkey, next);
        },
        function (json, next){
          data["currency"] = json.currency;
          data["endpoints"] = json.endpoints;
          data["fingerprint"] = json.pubkey;
          that.knownPeers(next);
        },
        function (peers, next){
          data["peers"] = peers || [];
          async.parallel({
            current: function (next) {
              theServer.dal.getCurrent(next);
            },
            parameters: function (next) {
              theServer.dal.getParameters(function (err, json) {
                next(err, json);
              });
            },
            uds: function (next) {
              async.waterfall([
                function (next) {
                  theServer.dal.getStat('ud', next);
                },
                function (stat, next) {
                  var json = new Stat(stat).json();
                  var blockNumbers = json.blocks;
                  var blocks = [];
                  async.forEachSeries(blockNumbers, function (blockNumber, callback) {
                    async.waterfall([
                      function (next) {
                        theServer.dal.getPromoted(blockNumber, next);
                      },
                      function (block, next) {
                        blocks.push(block);
                        next();
                      }
                    ], callback);
                  }, function (err) {
                    next(err, blocks);
                  });
                }
              ], next);
            },
            root: function (next) {
              theServer.dal.getPromoted(0, next);
            }
          }, next);
        },
        function (res, next){
          var current = res.current;
          var uds = res.uds;
          var parameters = res.parameters;
          var c = res.parameters.c;
          var lastUDblock = uds.length > 0 ? uds[uds.length-1] : null;
          var prevUDblock = uds.length > 1 ? uds[uds.length-2] : null;
          data["currency_acronym"] = 'MB';
          data["amendmentsCount"] = current.number + 1;
          data["membersCount"] = current.membersCount || 0;
          data["membersJoining"] = 0; // TODO
          data["membersLeaving"] = 0; // TODO
          data["votersCount"] = 0; // TODO
          data["votersJoining"] = 0; // TODO
          data["votersLeaving"] = 0; // TODO
          data["UD_1"] = prevUDblock ? prevUDblock.dividend : 0;
          data["N_1"] = prevUDblock ? prevUDblock.membersCount : 0;
          data["M_1"] = prevUDblock ? prevUDblock.monetaryMass - data.N_1*data.UD_1 : 0;
          data["UD"] = lastUDblock ? lastUDblock.dividend : parameters.ud0;
          data["N"] = lastUDblock ? lastUDblock.membersCount : 0;
          data["M"] = lastUDblock ? lastUDblock.monetaryMass - data.N*data.UD : 0;
          data["Mplus1"] = lastUDblock ? lastUDblock.monetaryMass : 0;
          data["UDplus1"] = Math.ceil(Math.max(data.UD, c*data.Mplus1/data.N));
          data["MsurN"] = data.M / data.N;
          data["M_1surN"] = data.M_1 / data.N;
          data["blocks"] = res.uds;
          data["parameters"] = res.parameters;
          data["T"] = current.medianTime;
          // ....
          // var start = new Date();
          // start.setTime(parseInt(parameters.AMStart)*1000);
          data["amendmentsPending"] = 0; // TODO
          data["AMStart"] = 0; // TODO start.toString();
          data["AMFreq"] = (parseInt(parameters.avgGenTime)/60) + " minutes";
          data["UD0"] = parameters.ud0;
          data["UDFreq"] = (parseInt(parameters.dt)/(3600*24)) + " days";
          data["UDPercent"] = (parameters.c*100) + "%";
          next(null, data);
        },
      ], function(err, data) {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }

  this.graphs = function(){
    return getReadyServer()
      .then(function(){
        return Q.all([
          theServer.dal.getCurrentBlockOrNull(),
          theServer.dal.getRootBlock()
        ]);
      })
      .spread(function(current, root) {
        return Q.Promise(function(resolve, reject){
          var from = current ? Math.max(0, current.number - 200) : 0;
          var to   = current ? current.number + 1 : 0;
          var lastBlocks = _.range(from, to);
          async.waterfall([
            function (next) {
              if (lastBlocks.length == 0) return next('No block');
              var sp = root.parameters.split(':');
              var parameters = {
                "c":                parseFloat(sp[0]),
                "dt":               parseInt(sp[1]),
                "ud0":              parseInt(sp[2]),
                "sigDelay":         parseInt(sp[3]),
                "sigValidity":      parseInt(sp[4]),
                "sigQty":           parseInt(sp[5]),
                "sigWoT":           parseInt(sp[6]),
                "msValidity":       parseInt(sp[7]),
                "stepMax":          parseInt(sp[8]),
                "medianTimeBlocks": parseInt(sp[9]),
                "avgGenTime":       parseInt(sp[10]),
                "dtDiffEval":       parseInt(sp[11]),
                "blocksRot":        parseInt(sp[12]),
                "percentRot":       parseFloat(sp[13])
              };
              var medianTimes = [];
              var accelerations = [];
              var speed = [];
              var increments = [];
              var members = [];
              var certifications = [];
              var newcomers = [];
              var actives = [];
              var outputs = [];
              var outputsEstimated = [];
              var leavers = [];
              var excluded = [];
              var transactions = [];
              var nbDifferentIssuers = [];
              var difficulties = [];
              var blockchainTime = 0;
              return lastBlocks.reduce(function(promise, blockNumber, index) {
                return promise
                  .then(function(previousBlock){
                    return theServer.dal.getPromoted(blockNumber)
                      .then(function(block){
                        members.push(block.membersCount);
                        certifications.push(block.certifications.length);
                        newcomers.push(block.identities.length);
                        actives.push(block.actives.length);
                        leavers.push(block.leavers.length);
                        excluded.push(block.excluded.length);
                        transactions.push(block.transactions.length);
                        medianTimes.push(block.medianTime);
                        accelerations.push(block.time - block.medianTime);
                        difficulties.push(block.powMin);
                        increments.push(block.medianTime - (index ? previousBlock.medianTime : block.medianTime));
                        // Accumulation of last medianTimeBlocks variation
                        var acc = 0;
                        for (var i = Math.max(0, index - parameters.dtDiffEval); i < index; i++) {
                          acc += increments[i+1];
                        }
                        speed.push(acc / parameters.dtDiffEval);
                        // Volume
                        var outputVolume = 0;
                        block.transactions.forEach(function (tx) {
                          tx.outputs.forEach(function (out) {
                            var amount = parseInt(out.split(':')[1]);
                            outputVolume += amount;
                          });
                        });
                        outputs.push(outputVolume);
                        // Volume without money change
                        var outputVolumeEstimated = 0;
                        block.transactions.forEach(function (tx) {
                          tx.outputs.forEach(function (out) {
                            var sp = out.split(':');
                            var recipient = sp[0];
                            var amount = parseInt(sp[1]);
                            if (tx.signatories.indexOf(recipient) == -1)
                              outputVolumeEstimated += amount;
                          });
                        });
                        outputsEstimated.push(outputVolumeEstimated);
                        // Number of different issuers
                        var issuers = [];
                        for (var i = Math.max(0, index - 1 - parameters.blocksRot); i <= index - 1; i++) {
                          issuers.push(block.issuer);
                        }
                        nbDifferentIssuers.push(_(issuers).uniq().length);
                        blockchainTime = block.medianTime;
                        return block;
                      });
                  })
              }, Q())
                .then(function(){
                  next(null, {
                    'parameters': parameters,
                    'blockchainTime': blockchainTime,
                    'medianTimes': medianTimes,
                    'speed': speed,
                    'accelerations': accelerations,
                    'medianTimeIncrements': increments,
                    'certifications': certifications,
                    'members': members,
                    'newcomers': newcomers,
                    'actives': actives,
                    'leavers': leavers,
                    'excluded': excluded,
                    'outputs': outputs,
                    'outputsEstimated': outputsEstimated,
                    'transactions': transactions,
                    'difficulties': difficulties,
                    'nbDifferentIssuers': nbDifferentIssuers
                  });
                })
                .fail(next);
            }
          ], function(err, data) {
            if (err) reject(err); else resolve(data);
          });
        });
      });
  };
}

util.inherits(ServerHandler, stream.Transform);

//function AdminAPI(conf, mdb, mhost, mport, logsOut) {
//
//  var theServer = ucoin.createTxServer({ name: mdb || "ucoin_default", host: mhost, port: mport }, conf);
//
//  this.getServer = function() {
//    return theServer;
//  };
//
//  this.doStart = function() {
//
//    // Initialize server (db connection, ...)
//    theServer.init();
//
//    getServer()
//      .tap(function(server){
//        return server.isListening() ? Q() : Q.nbind(server.start, server)();
//      })
//      .fail(function(err) {
//        logger.error('Could not auto start ucoin: %s', err.message || err);
//        logger.error(err.stack);
//      });
//  };
//
//  this.status = function(req, res) {
//    getServer()
//      .then(getStatus)
//      .then(onSuccess(res))
//      .fail(onError(res));
//  };
//
//  this.home = function(req, res){
//    getNode()
//      .then(getHomeData)
//      .then(onSuccess(res))
//      .fail(onError(res));
//  };
//
//  this.logs = function(req, res){
//    Q(logsOut)
//      .then(onSuccess(res))
//      .fail(onError(res));
//  };
//
//  function getServer() {
//    return (theServer ?
//      // Use existing server
//      Q(theServer) :
//      // Creates a new one
//      service())
//      .then(function(server){
//        theServer = theServer || server;
//        return theServer;
//      });
//  }
//
//  function getNode() {
//    return getServer()
//      .then(function(server){
//        return Q.nfcall(vucoin, server.conf.ipv4, server.conf.port);
//      });
//  }
//
//  function getStatus(server) {
//    return Q.nbind(theServer.dal.getBlockCurrent, theServer.dal)()
//      .then(function(current){
//        return {
//          "status": theServer.isListening() ? "UP" : "DOWN",
//          "current": current
//        }
//      });
//  }
//
//  function service() {
//    return Q.Promise(function(resolve, reject){
//    });
//  }
//};
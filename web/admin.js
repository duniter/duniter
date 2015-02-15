var async       = require('async');
var _           = require('underscore');
var program     = require('commander');
var mongoose    = require('mongoose');
var vucoin      = require('vucoin');
var Q           = require('q');
var wizard      = require('../app/lib/wizard');
var router      = require('../app/lib/streams/router');
var multicaster = require('../app/lib/streams/multicaster');
var logger      = require('../app/lib/logger')('ucoind');
var signature   = require('../app/lib/signature');
var crypto      = require('../app/lib/crypto');
var base58      = require('../app/lib/base58');
var constants   = require('../app/lib/constants');
var Synchroniser = require('../app/lib/sync');
var pjson       = require('../package.json');
var ucoin       = require('./../index');
var webapp      = require('../web/app');

module.exports = function AdminAPI(conf, mdb, mhost, mport) {

  var theServer;

  this.start = function(req, res) {
    getServer()
      .tap(function(server){
        return server.isListening() ? Q() : Q.nbind(server.start, server)();
      })
      .then(getStatus)
      .then(onSuccess(res))
      .fail(onError(res));
  };

  this.stop = function(req, res) {
    Q()
      .then(function(){
        theServer.stop();
      })
      .then(getStatus)
      .then(onSuccess(res))
      .fail(onError(res));
  };

  this.status = function(req, res) {
    getServer()
      .then(getStatus)
      .then(onSuccess(res))
      .fail(onError(res));
  };

  this.home = function(req, res){
    getNode()
      .then(getHomeData)
      .then(onSuccess(res))
      .fail(onError(res));
  };

  function getServer() {
    return (theServer ?
      // Use existing server
      Q(theServer) :
      // Creates a new one
      service());
  }

  function getNode() {
    return getServer()
      .then(function(server){
        return Q.nfcall(vucoin, server.conf.ipv4, server.conf.port);
      });
  }

  function getStatus(server) {
    theServer = theServer || server;
    var Block = theServer.conn.model('Block');
    return Q.nbind(Block.current, Block)()
      .then(function(current){
        return {
          "status": theServer.isListening() ? "UP" : "DOWN",
          "current": current
        }
      });
  }

  function service() {
    return Q.Promise(function(resolve, reject){
      var dbName = mdb || "ucoin_default";

      var server = ucoin.createTxServer({ name: dbName, host: mhost, port: mport }, conf);
      server.on('mongoFail', reject.bind(null, 'Could not connect to MongoDB. Is it installed?'));
      server.on('BMAFailed', reject.bind(null, 'Could not bind BMA API'));

      // Connecting to DB
      server.on('services', function (err) {

        if (err) {
          reject(err);
        } else {
          resolve(server);
        }
      });

      // Initialize server (db connection, ...)
      server.init();
    });
  }
};

function getHomeData(node) {
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
      async.waterfall([
        function (next){
          node.network.peering.peers.get({ leaves: true }, next);
        },
        function (merkle, next) {
          var peers = [];
          async.forEach(merkle.leaves, function(fingerprint, callback){
            async.waterfall([
              function (next){
                node.network.peering.peers.get({ leaf: fingerprint }, next);
              },
              function(json, next){
                var peer = (json.leaf && json.leaf.value) || {};
                peers.push(peer);
                next();
              },
            ], callback);
          }, function (err) {
            next(null, peers);
          });
        }
      ], done);
    };

    async.waterfall([
      function (next){
        node.network.peering.get(next);
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
            node.blockchain.current(next);
          },
          parameters: function (next) {
            node.currency.parameters(function (err, json) {
              next(err, json);
            });
          },
          uds: function (next) {
            async.waterfall([
              function (next) {
                node.blockchain.with.ud(next);
              },
              function (json, next) {
                var blockNumbers = json.result.blocks;
                var blocks = [];
                async.forEachSeries(blockNumbers, function (blockNumber, callback) {
                  async.waterfall([
                    function (next) {
                      node.blockchain.block(blockNumber, next);
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
            node.blockchain.block(0, next);
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
        data["currency_acronym"] = 'ZB';
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

function onSuccess(res) {
  return function(data) {
    res.type('application/json');
    res.send(JSON.stringify(data || {}));
  }
}

function onError(res) {
  return function(err) {
    res.type('application/json');
    res.send(500, JSON.stringify({ message: err.message || err }));
  }
}
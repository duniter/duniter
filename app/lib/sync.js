var async      = require('async');
var mongoose   = require('mongoose');
var _          = require('underscore');
var sha1       = require('sha1');
var merkle     = require('merkle');
var Membership = mongoose.model('Membership');
var Amendment  = mongoose.model('Amendment');
var PublicKey  = mongoose.model('PublicKey');
var Merkle     = mongoose.model('Merkle');
var vucoin     = require('vucoin');

module.exports = function Synchroniser (host, port, authenticated, currency) {

  var VoteService       = require('../service/VoteService')(currency);
  var MembershipService = require('../service/MembershipService').get(currency);
  var StrategyService   = require('../service/StrategyService')();
  var that = this;

  this.sync = function (done) {
    console.log('Connecting remote host...');
    vucoin(host, port, authenticated, function (err, node) {
      if(err){
        done('Cannot sync: ' + err);
        return;
      }

      // Global sync vars
      var amendments = {};
      var remoteCurrentNumber;

      async.waterfall([
        function (next){
          console.log('Sync started.');
          next();
        },

        //============
        // Public Keys
        //============
        function (next){
          Merkle.forPublicKeys(next);
        },
        function (merkle, next) {
          node.pks.all({}, function (err, json) {
            var rm = new NodesMerkle(json);
            if(rm.root() != merkle.root()){
              // console.log('Merkles for public keys: differences !');
              var indexesToAdd = [];
              node.pks.all({ extract: true }, function (err, json) {
                _(json.leaves).keys().forEach(function(key){
                  var leaf = json.leaves[key];
                  if(merkle.leaves().indexOf(leaf.hash) == -1){
                    indexesToAdd.push(key);
                  }
                });
                var hashes = [];
                async.forEachSeries(indexesToAdd, function(index, callback){
                  hashes.push(json.leaves[index].hash);
                  PublicKey.persistFromRaw(json.leaves[index].value.pubkey, callback);
                }, function(err, result){
                  next(err);
                });
              });
            }
            else next();
          });
        },

        //============
        // Amendments
        //============
        function (next){
          Amendment.nextNumber(next);
        },
        function (number, next) {
          node.hdc.amendments.current(function (err, json) {
            if(err){
              next();
              return;
            }
            remoteCurrentNumber = parseInt(json.number);
            amendments[remoteCurrentNumber] = json.raw;
            var toGetNumbers = _.range(number, remoteCurrentNumber);
            async.forEachSeries(toGetNumbers, function(amNumber, callback){
              console.log("Fetching amendment #%s ...", amNumber);
              async.waterfall([
                function (cb){
                  if(!amendments[amNumber])
                    node.hdc.amendments.promoted(amNumber, cb);
                  else
                    cb(null, { raw: amendments[amNumber] });
                },
                function (am, cb){
                  amendments[amNumber] = am.raw;
                  // console.log('ID: %s-%s', amNumber, sha1(amendments[amNumber]).toUpperCase());
                  node.hdc.amendments.promoted(amNumber + 1, cb);
                },
                function (am, cb){
                  amendments[amNumber + 1] = am.raw;
                  // _(amendments).keys().forEach(function (key) {
                  //   console.log('=====> AM %s = %s', key, amendments[key] ? 'OK' : amendments[key]);
                  // });
                  cb();
                },
                function (cb) {
                  applyMemberships(amendments, amNumber, node, cb);
                },
                function (cb) {
                  node.hdc.amendments.view.signatures(amNumber + 1, sha1(amendments[amNumber + 1]).toUpperCase(), { extract: true }, cb);
                },
                function (json, cb){
                  applyVotes(amendments, amNumber, number, json, node, cb);
                },
                function (nextNumber, cb) {
                  number = nextNumber;
                  cb();
                }
              ], function (err, result) {
                callback(err);
              });
            }, function(err, result){
              next(err, number);
            });
          });
        },
        function (number, next) {
          if(number == remoteCurrentNumber){
            console.log('Synchronise current #%s ...', remoteCurrentNumber);
            // console.log(amendments[remoteCurrentNumber] + '---------------');
            // Synchronise remote's current
            async.waterfall([
              function (callback){
                applyMemberships(amendments, number, node, callback);
              },
              function (callback){
                node.hdc.community.votes({ extract: true }, callback);
              },
              function (json, callback) {
                applyVotes(amendments, number, number, json, node, callback);
              }
            ], function (err) {
              next(err);
            });
          }
          else next();
        },
        function (next) {
          node.hdc.community.memberships({ extract: true }, next);
        },
        function (json, next) {
          applyTargetedMemberships(json.leaves, function () { return true; }, next);
        }
      ], function (err, result) {
        console.log('Sync finished.');
        done(err);
      });
    })
  }

  function applyMemberships(amendments, amNumber, node, cb) {
    // console.log('Applying memberships for amendment #%s', amNumber);
    async.waterfall([
      function (next) {
        Merkle.forMembership(amNumber - 1, next);
      },
      function (prevMerkle, next) {
        Merkle.updateManyForNextMembership(prevMerkle.leaves(), next);
      },
      function (next) {
        node.hdc.amendments.view.memberships(amNumber, sha1(amendments[amNumber]).toUpperCase(), {}, next);
      },
      function (json, next){
        Merkle.forMembership(amNumber - 1, function (err, prevMerkle) {
          if(prevMerkle.root() != json.levels[0][0]){
            // console.log('MS CHANGES (%s != %s)', prevMerkle.root(), json.levels[0][0]);
            var difff = [];
            async.waterfall([
              function (callback2) {
                node.hdc.amendments.view.memberships(amNumber, sha1(amendments[amNumber]).toUpperCase(), { lstart: json.depth, lend: json.levelsCount }, callback2);
              },
              function (json2, callback2){
                var leaves = json2.levels[json2.levelsCount -1];
                difff = _(leaves).difference(prevMerkle.leaves());
                node.hdc.amendments.view.memberships(amNumber, sha1(amendments[amNumber]).toUpperCase(), { extract: true }, callback2);
              },
              function (json, callback2) {
                applyTargetedMemberships(json.leaves, function (hash) {
                  return ~difff.indexOf(hash);
                }, callback2);
              }
            ], cb);
          }
          else cb();
        });
      }
    ], function (err, result) {
    });
  }

  function applyTargetedMemberships(merkleUrlLeaves, isToApply, done) {
    // console.log("Source memberships: %s", _(merkleUrlLeaves).size());
    async.forEachSeries(_(merkleUrlLeaves).keys(), function(key, callback){
      var msObj = merkleUrlLeaves[key];
      if(isToApply(msObj.hash)){
        var ms = new Membership({});
        _(msObj.value.request).keys().forEach(function (field) {
          ms[field] = msObj.value.request[field];
        });
        var signedMSR = ms.getRaw() + msObj.value.signature;
        MembershipService.submit(signedMSR, callback);
      }
      else callback();
    }, function(err, result){
      if(err){
        done(err);
        return;
      }
      done();
    });
  }

  function applyVotes(amendments, amNumber, number, json, node, cb) {
    // console.log('Applying votes for amendment #%s', amNumber);
    // console.log("Signatures: %s", _(json.leaves).size());
    async.forEachSeries(_(json.leaves).keys(), function(key, callback){
      var vote = json.leaves[key];
      VoteService.submit(amendments[amNumber] + vote.value.signature, function (err, am) {
        // Promotion time
        StrategyService.tryToPromote(am, function (err) {
          if(!err)
            number++;
          callback();
        });
      });
    }, function(err, result){
      cb(err, number);
    });
  }
}

function NodesMerkle (json) {
  
  var that = this;
  ["depth", "nodesCount", "leavesCount", "levelsCount"].forEach(function (key) {
    that[key] = json[key];
  });

  var i = 0;
  this.levels = [];
  while(json && json.levels[i]){
    this.levels.push(json.levels[i]);
    i++;
  }

  this.root = function () {
    return this.levels.length > 0 ? this.levels[0][0] : '';
  }
}

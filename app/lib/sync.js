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
              console.log('Merkles for public keys: differences !');
              var indexesToAdd = [];
              node.pks.all({ extract: true }, function (err, json) {
                _(json.merkle.leaves).keys().forEach(function(key){
                  var leaf = json.merkle.leaves[key];
                  if(merkle.leaves().indexOf(leaf.hash) == -1){
                    indexesToAdd.push(key);
                  }
                });
                var hashes = [];
                async.forEach(indexesToAdd, function(index, callback){
                  hashes.push(json.merkle.leaves[index].hash);
                  PublicKey.persistFromRaw(json.merkle.leaves[index].value.pubkey, callback);
                }, function(err, result){
                  merkle.pushMany(hashes);
                  merkle.save(function (err) {
                    next(err);
                  });
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
                  console.log('ID: %s-%s', amNumber, sha1(amendments[amNumber]).toUpperCase());
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
            ], next);
          }
          else next();
        }
      ], function (err, result) {
        console.log('Sync finished.');
        done(err);
      });
    })
  }

  function applyMemberships(amendments, amNumber, node, cb) {
    console.log('Applying memberships for amendment #%s', amNumber);
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
          if(prevMerkle.root() != json.merkle.levels[0][0]){
            console.log('MS CHANGES (%s != %s)', prevMerkle.root(), json.merkle.levels[0][0]);
            var difff = [];
            async.waterfall([
              function (callback2) {
                node.hdc.amendments.view.memberships(amNumber, sha1(amendments[amNumber]).toUpperCase(), { lstart: json.merkle.depth, lend: json.merkle.levelsCount }, callback2);
              },
              function (json2, callback2){
                var leaves = json2.merkle.levels[json2.merkle.levelsCount -1];
                difff = _(leaves).difference(prevMerkle.leaves());
                node.hdc.amendments.view.memberships(amNumber, sha1(amendments[amNumber]).toUpperCase(), { extract: true }, callback2);
              },
              function (json, callback2) {
                console.log("Memberships: %s", _(json.merkle.leaves).size());
                async.forEachSeries(_(json.merkle.leaves).keys(), function(key, callback3){
                  var msObj = json.merkle.leaves[key];
                  if(~difff.indexOf(msObj.hash)){
                    var ms = new Membership({});
                    _(msObj.value.request).keys().forEach(function (field) {
                      ms[field] = msObj.value.request[field];
                    });
                    var signedMSR = ms.getRaw() + msObj.value.signature;
                    MembershipService.submit(signedMSR, callback3);
                  }
                  else callback3();
                }, function(err, result){
                  if(err){
                    callback2(err);
                    return;
                  }
                  callback2();
                });
              }
            ], cb);
          }
          else cb();
        });
      }
    ], function (err, result) {
    });
  }

  function applyVotes(amendments, amNumber, number, json, node, cb) {
    console.log('Applying votes for amendment #%s', amNumber);
    console.log("Signatures: %s", _(json.merkle.leaves).size());
    async.forEachSeries(_(json.merkle.leaves).keys(), function(key, callback){
      var vote = json.merkle.leaves[key];
      VoteService.submit(amendments[amNumber] + vote.value.signature, function (err, am) {
        // Promotion time
        StrategyService.tryToPromote(am, function (err) {
          if(err){
            console.error(err);
          }
          else number++;
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
    that[key] = json.merkle[key];
  });

  var i = 0;
  this.levels = [];
  while(json.merkle && json.merkle.levels[i]){
    this.levels.push(json.merkle.levels[i]);
    i++;
  }

  this.root = function () {
    return this.levels.length > 0 ? this.levels[0][0] : '';
  }
}

var mongoose = require('mongoose');
var async    = require('async');
var _        = require('underscore');
var Schema   = mongoose.Schema;

var LinkSchema = new Schema({
  source: String,
  target: String,
  timestamp: String,
  obsolete: { type: Boolean, default: false },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

LinkSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

LinkSchema.methods = {
};

/**
* Mark as obsolete the links with an age equal to or below a given date
**/
LinkSchema.statics.obsoletes = function (minTimestamp, done) {
  var Link = this.model('Link');
  Link.update({ timestamp: { $lte: minTimestamp } }, { obsolete: true }, function (err) {
    done(err);
  });
}

/**
* Unmark obsolete from all the links
**/
LinkSchema.statics.unobsoletesAllLinks = function (done) {
  var Link = this.model('Link');
  Link.update({}, { obsolete: false }, function (err) {
    done(err);
  });
}

/**
* Mark as obsolete the links with an age equal to or below a given date
**/
LinkSchema.statics.isStillOver3Steps = function (fpr, ofMembers, newLinks, done) {
  var Link = this.model('Link');
  var newCertifiers = newLinks[fpr] || [];
  var remainingKeys = ofMembers.slice();
  // Without self
  remainingKeys = _(remainingKeys).difference([fpr]);
  var dist1Links = [];
  async.waterfall([
    function (next){
      // Remove direct links (dist 1)
      remainingKeys = _(remainingKeys).difference(newCertifiers);
      next();
    },
    function (next) {
      if (remainingKeys.length > 0) {
        // Look for 1 distance links
        Link.find({ target: fpr, obsolete: false }, function (err, links) {
          dist1Links = [];
          links.forEach(function(lnk){
            dist1Links.push(lnk.source);
          });
          // Add new certifiers as distance 1 links
          dist1Links = _(dist1Links.concat(newCertifiers)).uniq();
          next(err);
        });
      }
      else next();
    },
    function (next){
      // Remove distance 2 links (those for whom new links make 1 distance)
      var found = [];
      if (remainingKeys.length > 0) {
        async.forEachSeries(remainingKeys, function(member, callback){
          // Exists distance 1 link?
          async.detect(dist1Links, function (dist1member, callbackDist1) {
            // Look in newLinks
            var signatories = (newLinks[dist1member] || []);
            if (~signatories.indexOf(member)) {
              callbackDist1(true);
              return;
            }
            // dist1member signed 'fpr', so here we look for (member => dist1member => fpr sigchain)
            Link.find({ source: member, target: dist1member, obsolete: false }, function (err, links) {
              if (links && links.length > 0) {
                found.push(member);
                callbackDist1(true);
              }
              else callbackDist1(false);
            });
          }, function (detected) {
            if (detected)
              found.push(member);
            callback();
          });
        }, function(err){
          remainingKeys = _(remainingKeys).difference(found);
          next(err);
        });
      }
      else next();
    },
    function (next){
      // Remove distance 3 links (those for whom new links make 2 distance)
      var found = [];
      if (remainingKeys.length > 0) {
        async.forEachSeries(remainingKeys, function(member, callback){
          var dist2Links = [];

          async.waterfall([
            function (next){
              // Step 1. Detect distance 1 members from current member (potential dist 2 from 'fpr')
              // Look in database
              Link.find({ source: member, obsolete: false }, function (err, links) {
                dist2Links = [];
                links.forEach(function(lnk){
                  dist2Links.push(lnk.source);
                });
                next(err);
              });
              // Look in newLinks
              _(newLinks).keys().forEach(function(signed){
                (newLinks[signed] || []).forEach(function(signatories){
                  if (~signatories.indexOf(member)) {
                    dist2links.push(signed);
                  }
                });
              });
            },
            function (next){
              // Step 2. Detect links between distance 2 & distance 1 members
              async.detect(dist2Links, function (dist2member, callbackDist2) {
                // Exists distance 1 link?
                async.detect(dist1Links, function (dist1member, callbackDist1) {
                  // Look in newLinks
                  var signatories = (newLinks[dist1member] || []);
                  if (~signatories.indexOf(dist2member)) {
                    callbackDist1(true);
                    return;
                  }
                  // dist1member signed 'fpr', so here we look for (member => dist1member => fpr sigchain)
                  Link.find({ source: dist2member, target: dist1member, obsolete: false }, function (err, links) {
                    if (links && links.length > 0) {
                      callbackDist1(true);
                    }
                    else callbackDist1(false);
                  });
                }, callbackDist2);
              }, function (detected) {
                if (detected)
                  found.push(member);
                callback();
              });
            },
          ], callback);
        }, function(err){
          remainingKeys = _(remainingKeys).difference(found);
          next(err);
        });
      }
      else next();
    },
  ], function (err) {
    done(err, remainingKeys);
  });
}

/**
* Mark as obsolete the links with an age equal to or below a given date
**/
LinkSchema.statics.isOver3StepsOfAMember = function (key, members, done) {
  var fpr = key.fingerprint;
  var remainingKeys = [];
  members.forEach(function(m){
    remainingKeys.push(m.fingerprint);
  });
  // Without self
  remainingKeys = _(remainingKeys).difference([fpr]);
  var Link = this.model('Link');
  var dist1Links = [];
  async.waterfall([
    function (next){
      // Step 1 links: low cost
      var found = [];
      if (remainingKeys.length > 0) {
        async.forEachSeries(remainingKeys, function(member, callback){
          // Exists direct link?
          Link.find({ source: member, target: fpr, obsolete: false }, function (err, links) {
            if (links && links.length > 0) {
              found.push(member);
            }
            callback();
          });
        }, function(err){
          remainingKeys = _(remainingKeys).difference(found);
          next(err);
        });
      }
      else next();
    },
    function (next) {
      if (remainingKeys.length > 0) {
        // Look for 1 distance links
        Link.find({ target: fpr, obsolete: false }, function (err, links) {
          dist1Links = [];
          links.forEach(function(lnk){
            dist1Links.push(lnk.fingerprint);
          });
          next(err);
        });
      }
      else next();
    },
    function (next){
      // Step 2 links: medium cost
      var found = [];
      if (remainingKeys.length > 0) {
        async.forEachSeries(remainingKeys, function(member, callback){
          // Exists distance 1 link?
          async.detect(dist1Links, function (dist1member, callbackDist1) {
            // dist1member signed 'fpr', so here we look for (member => dist1member => fpr sigchain)
            Link.find({ source: member, target: dist1member, obsolete: false }, function (err, links) {
              if (links && links.length > 0) {
                found.push(member);
                callbackDist1(true);
              }
              else callbackDist1(false);
            });
          }, function (detected) {
            if (detected)
              found.push(member);
            callback();
          });
        }, function(err){
          remainingKeys = _(remainingKeys).difference(found);
          next(err);
        });
      }
      else next();
    },
    function (next){
      // Step 3 links: high cost
      var found = [];
      if (remainingKeys.length > 0) {
        async.forEachSeries(remainingKeys, function(member, callback){
          var dist2Links = [];

          async.waterfall([
            function (next){
              // Step 1. Detect distance 1 members from current member (potential dist 2 from 'fpr')
              Link.find({ source: member, obsolete: false }, function (err, links) {
                dist2Links = [];
                links.forEach(function(lnk){
                  dist2Links.push(lnk.fingerprint);
                });
                next(err);
              });
            },
            function (next){
              // Step 2. Detect links between distance 2 & distance 1 members
              async.detect(dist2Links, function (dist2member, callbackDist2) {
                // Exists distance 1 link?
                async.detect(dist1Links, function (dist1member, callbackDist1) {
                  // dist1member signed 'fpr', so here we look for (member => dist1member => fpr sigchain)
                  Link.find({ source: dist2member, target: dist1member, obsolete: false }, function (err, links) {
                    if (links && links.length > 0) {
                      callbackDist1(true);
                    }
                    else callbackDist1(false);
                  });
                }, callbackDist2);
              }, function (detected) {
                if (detected)
                  found.push(member);
                callback();
              });
            },
          ], callback);
        }, function(err){
          remainingKeys = _(remainingKeys).difference(found);
          next(err);
        });
      }
      else next();
    },
  ], function (err) {
    done(err, remainingKeys);
  });
}

module.exports = LinkSchema;

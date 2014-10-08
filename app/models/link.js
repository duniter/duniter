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
LinkSchema.statics.currentValidLinks = function (fpr, done) {
  var Link = this.model('Link');
  Link.find({ target: fpr, obsolete: false }, done);
}

LinkSchema.statics.getValidLinksFrom = function (from, done) {
  var Link = this.model('Link');
  Link.find({ source: from, obsolete: false }, done);
}

LinkSchema.statics.getValidLinksTo = function (to, done) {
  var Link = this.model('Link');
  Link.find({ target: to, obsolete: false }, done);
}

LinkSchema.statics.getValidFromTo = function (from, to, done) {
  var Link = this.model('Link');
  Link.find({ source: from, target: to, obsolete: false }, done);
}

LinkSchema.statics.getObsoletesFromTo = function (from, to, done) {
  var Link = this.model('Link');
  Link
    .find({ source: from, target: to, obsolete: true })
    .sort({ 'timestamp': -1 })
    .limit(1)
    .exec(function (err, links) {
      done(err, links);
    });
}

/**
* Mark as obsolete the links with an age equal to or below a given date
**/
LinkSchema.statics.obsoletes = function (minTimestamp, done) {
  var Link = this.model('Link');
  Link.update({ timestamp: { $lte: minTimestamp } }, { obsolete: true }, { multi: true }, function (err) {
    done(err);
  });
}

/**
* Unmark obsolete from all the links
**/
LinkSchema.statics.unobsoletesAllLinks = function (done) {
  var Link = this.model('Link');
  Link.update({}, { obsolete: false }, { multi: true }, function (err) {
    done(err);
  });
}

module.exports = LinkSchema;

var mongoose  = require('mongoose');
var async     = require('async');
var _         = require('underscore');
var Schema    = mongoose.Schema;
var logger    = require('../lib/logger')('stat');

var BlockSchema = new Schema({
  statName: String,
  lastParsedBlock: Number,
  blocks: {"type": [Number], "default": []},
});

BlockSchema.methods = {

  json: function () {
    return { "blocks": this.blocks };
  }
};

BlockSchema.statics.getStat = function (name, done) {
  this
    .find({ statName: name })
    .exec(function (err, stats) {
      done(err, stats.length > 0 ? stats[0] : null);
    });
};

module.exports = BlockSchema;

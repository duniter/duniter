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

module.exports = BlockSchema;

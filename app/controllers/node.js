"use strict";
var util     = require('util');
var async    = require('async');
var _        = require('underscore');
var stream   = require('stream');
var unix2dos = require('../lib/unix2dos');
var dos2unix = require('../lib/dos2unix');
var parsers  = require('../lib/streams/parsers/doc');
var logger   = require('../lib/logger')();

module.exports = function (wotServer) {
  return new NodeBinding(wotServer);
};

function NodeBinding (server) {

  this.summary = function (req, res) {
    res.type('application/json');
    res.send(200, JSON.stringify({
      "ucoin": {
        "software": "ucoind",
        "version": server.version
      }
    }, null, "  "));
  };
}

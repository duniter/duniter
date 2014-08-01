var jpgp       = require('../lib/jpgp');
var async      = require('async');
var _          = require('underscore');

module.exports.get = function (conn, conf) {
  return new KeyService(conn, conf);
};

function KeyService (conn, conf) {

  this.load = function (done) {
    done();
  };
}

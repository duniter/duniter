var VoteParser = require('./vote');
var util       = require('util');
var split      = require('../../../split');
var rawer      = require('../../../rawer');
var _          = require('underscore');

module.exports = AmendmentParser;

function AmendmentParser (onError) {

  VoteParser.call(this, onError);

  this.rawerFunc = rawer.getAmendment;

  var parentVerify = this._verify;

  this._clean = function (obj) {
    this.cleanAmendment(obj);
  }

  this._verify = function (obj) {
    parentVerify({ amendment: obj });
  }
}

util.inherits(AmendmentParser, VoteParser);

var AmendmentParser = require('./amendment');
var rawer           = require('../../../rawer');
var util            = require('util');
var sha1            = require('sha1');
var unix2dos        = require('../../../unix2dos');
var _               = require('underscore');

module.exports = VoteParser;

function VoteParser (onError) {
  
  AmendmentParser.call(this, onError);

  this.rawerFunc = rawer.getVote;

  var parentParse = this.parse;
  var parentClean = this._clean;
  var parentVerify = this.verify;

  this.parse = function (toParse, obj) {
    var str = unix2dos(toParse);
    var index = str.indexOf('-----BEGIN PGP');
    if (~index) {
      obj.signature = str.substring(index);
    }
    obj.hash = sha1(str).toUpperCase();
    obj.amendment = {};
    var amendmentPart = str.substring(0, index);
    parentParse(amendmentPart, obj.amendment);
  };

  this._clean = function (obj) {
    parentClean(obj.amendment);
  };

  this.verify = function (obj) {
    parentVerify(obj.amendment);
  };
}

util.inherits(VoteParser, AmendmentParser);

var GenericParser = require('./GenericParser');
var rawer         = require('../../../rawer');
var util          = require('util');
var sha1          = require('sha1');
var split         = require('../../../split');
var unix2dos      = require('../../../unix2dos');
var _             = require('underscore');

module.exports = StatusParser;

function StatusParser (onError) {
  
  var captures = [
    {prop: "version",   regexp: /Version: (.*)/},
    {prop: "currency",  regexp: /Currency: (.*)/},
    {prop: "status",    regexp: /Status: (.*)/}
  ];
  var multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getStatus, onError);

  this._clean = function (obj) {
  };

  this._verify = function(obj){
    var err = null;
    var code = 150;
    var codes = {
      'BAD_VERSION': 150,
      'BAD_CURRENCY': 151,
      'BAD_STATUS': 152
    }
    if(!err){
      // Version
      if(!obj.version || !obj.version.match(/^1$/))
        err = {code: codes['BAD_VERSION'], message: "Version unknown"};
    }
    if(!err){
      // Status
      if(obj.status && !(obj.status + "").match(/^(ASK|NEW|NEW_BACK|UP|DOWN)$/))
        err = {code: codes['BAD_STATUS'], message: "Status must be provided and match either ASK, NEW, NEW_BACK, UP or DOWN"};
    }
    return err && err.message;
  };
}

util.inherits(StatusParser, GenericParser);

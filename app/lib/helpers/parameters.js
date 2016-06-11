"use strict";
var async     = require('async');
var Q = require('q');
var constants = require('../constants');

module.exports = function () {
  return new ParameterNamespace();
};

function ParameterNamespace () {

  this.getSearch = function (req, callback) {
    if(!req.params || !req.params.search){
      callback("No search criteria given");
      return;
    }
    callback(null, req.params.search);
  };

  this.getSearchP = (req) => Q.nbind(this.getSearch, this)(req);

  this.getCountAndFrom = function (req){
    if(!req.params.from){
      throw "From is required";
    }
    if(!req.params.count){
      throw "Count is required";
    }
    var matches = req.params.from.match(/^(\d+)$/);
    if(!matches){
      throw "From format is incorrect, must be a positive integer";
    }
    var matches2 = req.params.count.match(/^(\d+)$/);
    if(!matches){
      throw "Count format is incorrect, must be a positive integer";
    }
    return {
      count: matches2[1],
      from: matches[1]
    };
  };

  this.getPubkey = function (req, callback){
    if(!req.params.pubkey){
      callback('Parameter `pubkey` is required');
      return;
    }
    var matches = req.params.pubkey.match(constants.PUBLIC_KEY);
    if(!matches){
      callback("Pubkey format is incorrect, must be a Base58 string");
      return;
    }
    callback(null, matches[0]);
  };

  this.getPubkeyP = (req) => Q.nbind(this.getPubkey, this)(req);

  this.getFrom = function (req, callback){
    if(!req.params.from){
      callback('Parameter `from` is required');
      return;
    }
    var matches = req.params.from.match(/^(\d+)$/);
    if(!matches){
      callback("From format is incorrect, must be a positive or zero integer");
      return;
    }
    callback(null, matches[0]);
  };

  this.getFromP = (req) => Q.nbind(this.getFrom, this)(req);

  this.getTo = function (req, callback){
    if(!req.params.to){
      callback('Parameter `to` is required');
      return;
    }
    var matches = req.params.to.match(/^(\d+)$/);
    if(!matches){
      callback("To format is incorrect, must be a positive or zero integer");
      return;
    }
    callback(null, matches[0]);
  };

  this.getToP = (req) => Q.nbind(this.getTo, this)(req);

  this.getNumber = function (req, callback){
    if(!req.params.number){
      callback("Number is required");
      return;
    }
    var matches = req.params.number.match(/^(\d+)$/);
    if(!matches){
      callback("Number format is incorrect, must be a positive integer");
      return;
    }
    callback(null, parseInt(matches[1]));
  };

  this.getNumberP = (req) => Q.nbind(this.getNumber, this)(req);
}

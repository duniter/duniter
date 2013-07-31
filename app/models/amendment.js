var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var _        = require('underscore');
var fs       = require('fs');
var Schema   = mongoose.Schema;

var AmendmentSchema = new Schema({
  version: String,
  currency: String,
  number: String,
  previousHash: String,
  dividend: String,
  coinMinPower: String,
  votersRoot: String,
  votersCount: String,
  votersChanges: Array,
  membersRoot: String,
  membersCount: String,
  membersChanges: Array,
  hash: String,
  created: Date,
  updated: Date
});

function simpleLineExtraction(am, wholeAmend, cap, done) {
  var fieldValue = wholeAmend.match(cap.regexp);
  if(fieldValue && fieldValue.length === 2){
    am[cap.prop] = fieldValue[1];
    done();
  }
  else done();
}

function multipleLinesExtraction(am, wholeAmend, cap, done) {
  var fieldValue = wholeAmend.match(cap.regexp);
  am[cap.prop] = [];
  if(fieldValue && fieldValue.length == 2){
    var lines = fieldValue[1].split(/\n/);
    if(lines[lines.length - 1].match(/^$/)){
      for (var i = 0; i < lines.length - 1; i++) {
        var line = lines[i];
        var fprChange = line.match(/([+-][A-Z\d]{40})/);
        if(fprChange && fprChange.length == 2){
          am[cap.prop].push(fprChange[1]);
        }
        else{
          done("Wrong structure for line: '" + line + "'");
          return;
        }
      }
      done();
    }
    else done("Multiple line field '" + cap.prop + "' must end with a new line character");
  }
  else done();
}

AmendmentSchema.methods = {
  parse: function(rawAmend, callback) {
    if(!rawAmend){
      callback("No amendment given");
      return;
    }
    this.hash = sha1(rawAmend.unix2dos()).toUpperCase();
    var obj = this;
    var captures = [
      {prop: "version",         regexp: /Version: (.*)/},
      {prop: "currency",        regexp: /Currency: (.*)/},
      {prop: "number",          regexp: /Number: (.*)/},
      {prop: "previousHash",    regexp: /PreviousHash: (.*)/},
      {prop: "dividend",        regexp: /UniversalDividend: (.*)/},
      {prop: "coinMinPower",    regexp: /CoinMinimalPower: (.*)/},
      {prop: "votersRoot",      regexp: /VotersRoot: (.*)/},
      {prop: "votersCount",     regexp: /VotersCount: (.*)/},
      {prop: "votersChanges",   regexp: /VotersChanges:\n([\s\S]*)MembersRoot/},
      {prop: "membersRoot",     regexp: /MembersRoot: (.*)/},
      {prop: "membersCount",    regexp: /MembersCount: (.*)/},
      {prop: "membersChanges",  regexp: /MembersChanges:\n([\s\S]*)/}
    ];
    var crlfCleaned = rawAmend.replace(/\r\n/g, "\n");
    if(crlfCleaned.match(/\n$/)){
      async.forEach(captures, function (cap, done) {
        if(cap.prop != "membersChanges" && cap.prop != "votersChanges")
          simpleLineExtraction(obj, crlfCleaned, cap, done);
        else
          multipleLinesExtraction(obj, crlfCleaned, cap, done);
      }, callback);
    }
    else callback("Bad document structure: no new line character at the end of the document.");
  },

  verify: function(currency, done){
    var obj = this;
    async.waterfall([
      function(callback, err){
        // Version
        if(!obj.version || !obj.version.match(/^1$/))
          err = {code: 100, message: "Version unknown"};
        callback(err);
      },
      function(callback, err){
        // Currency
        if(!obj.currency || !obj.currency.match("^"+ currency + "$"))
          err = {code: 101, message: "Currency '"+ obj.currency +"' not managed"};
        callback(err);
      },
      function(callback, err){
        // Number
        if(!obj.number || !obj.number.match(/^\d+$/))
          err = {code: 102, message: "Incorrect Number field"};
        callback(err);
      },
      function(callback, err){
        // Previous hash
        var isRoot = parseInt(obj.number, 10) === 0;
        if(!isRoot && (!obj.previousHash || !obj.previousHash.match(/^[A-Z\d]{40}$/)))
          err = {code: 103, message: "PreviousHash must be provided for non-root amendment and match an uppercase SHA1 hash"};
        else if(isRoot && obj.previousHash)
          err = {code: 104, message: "PreviousHash must not be provided for root amendment"};
        callback(err);
      },
      function(callback, err){
        // Universal Dividend
        if(obj.dividend && !obj.dividend.match(/^\d+$/))
          err = {code: 105, message: "UniversalDividend must be a decimal number"};
        callback(err);
      },
      function(callback, err){
        // Coin Minimal Power
        if(obj.coinMinPower && !obj.dividend)
          err = {code: 106, message: "CoinMinimalPower requires a valued UniversalDividend field"};
        else if(obj.coinMinPower && !obj.coinMinPower.match(/^\d+$/))
          err = {code: 107, message: "CoinMinimalPower must be a decimal number"};
        else if(obj.coinMinPower && obj.dividend.length < parseInt(obj.coinMinPower, 10) + 1)
          err = {code: 108, message: "No coin can be created with this value of CoinMinimalPower and UniversalDividend"};
        callback(err);
      },
      function(callback, err){
        // VotersRoot
        if(!obj.votersRoot || !obj.votersRoot.match(/^[A-Z\d]{40}$/))
          err = {code: 109, message: "VotersRoot must be provided and match an uppercase SHA1 hash"};
        callback(err);
      },
      function(callback, err){
        // VotersCount
        if(!obj.votersCount || !obj.votersCount.match(/^\d+$/))
          err = {code: 110, message: "VotersCount must be a positive or null decimal number"};
        callback(err);
      },
      function(callback, err){
        // MembersRoot
        if(!obj.membersRoot || !obj.membersRoot.match(/^[A-Z\d]{40}$/))
          err = {code: 111, message: "MembersRoot must be provided and match an uppercase SHA1 hash"};
        callback(err);
      },
      function(callback, err){
        // MembersCount
        if(!obj.membersCount || !obj.membersCount.match(/^\d+$/))
          err = {code: 112, message: "MembersCount must be a positive or null decimal number"};
        callback(err);
      }
    ], function (err, result) {
      if(err)
        done(err.message, err.code);
      else
        done();
    });
  },

  getNewMembers: function() {
    var members = [];
    for (var i = 0; i < this.membersChanges.length; i++) {
      var matches = this.membersChanges[i].match(/^\+([\w\d]{40})$/);
      if(matches){
        members.push(matches[1]);
      }
    }
    return members;
  },

  getLeavingMembers: function() {
    var members = [];
    for (var i = 0; i < this.membersChanges.length; i++) {
      var matches = this.membersChanges[i].match(/^\-([\w\d]{40})$/);
      if(matches){
        members.push(matches[1]);
      }
    }
    return members;
  },

  getNewVoters: function() {
    var voters = [];
    for (var i = 0; i < this.votersChanges.length; i++) {
      var matches = this.votersChanges[i].match(/^\+([\w\d]{40})$/);
      if(matches){
        voters.push(matches[1]);
      }
    }
    return voters;
  },

  getLeavingVoters: function() {
    var voters = [];
    for (var i = 0; i < this.votersChanges.length; i++) {
      var matches = this.votersChanges[i].match(/^\-([\w\d]{40})$/);
      if(matches){
        voters.push(matches[1]);
      }
    }
    return voters;
  },

  getRaw: function() {
    var raw = "";
    raw += "Version: " + this.version + "\n";
    raw += "Currency: " + this.currency + "\n";
    raw += "Number: " + this.number + "\n";
    if(this.previousHash){
      raw += "PreviousHash: " + this.previousHash + "\n";
    }
    if(this.dividend){
      raw += "UniversalDividend: " + this.dividend + "\n";
    }
    if(this.coinMinPower){
      raw += "CoinMinimalPower: " + this.coinMinPower + "\n";
    }
    raw += "VotersRoot: " + this.votersRoot + "\n";
    raw += "VotersCount: " + this.votersCount + "\n";
    raw += "VotersChanges:\n";
    for(var j = 0; j < this.votersChanges.length; j++){
      raw += this.votersChanges[j] + "\n";
    }
    raw += "MembersRoot: " + this.membersRoot + "\n";
    raw += "MembersCount: " + this.membersCount + "\n";
    raw += "MembersChanges:\n";
    for(var i = 0; i < this.membersChanges.length; i++){
      raw += this.membersChanges[i] + "\n";
    }
    return raw.unix2dos();
  },

  loadFromFile: function(file, done) {
    var obj = this;
    fs.readFile(file, {encoding: "utf8"}, function (err, data) {
      obj.parse(data, function(err) {
        done(err);
      });
    });
  }
};

var Amendment = mongoose.model('Amendment', AmendmentSchema);
var exec = require('child_process').exec,
sys      = require('sys');

var JPGP_JAR = 'bin/jpgp-0.0.2-SNAPSHOT.jar';

function JPGP() {

  this.args = [];

  // PUBLIC
  this.certificate = function(asciiArmored) {
    this.args.push({opt: 'c', value: escape(asciiArmored)});
    return this;
  };

  this.publicKey = function(asciiArmored) {
    this.args.push({opt: 'p', value: escape(asciiArmored)});
    return this;
  };

  this.signature = function(asciiArmored) {
    this.args.push({opt: 's', value: escape(asciiArmored)});
    return this;
  };

  this.uid = function(uid_string) {
    this.args.push({opt: 'u', value: escape(uid_string)});
    return this;
  };

  this.data = function(data_string) {
    this.args.push({opt: 'd', value: escape(data_string)});
    return this;
  };

  this.noCarriage = function() {
    this.args.push({opt: 'n'});
    return this;
  };

  this.parse = function(callback) {
    command('P', this.args, callback);
  };

  this.verify = function(callback) {
    command('V', this.args, function (err, stdout, stderr) {
      if(!err && !stderr){
        var verified = JSON.parse(stdout).data;
        if(verified){
          callback();
        }
        else callback("Signature does not match.\n" + err + "\n" + stdout + "\n" + stderr);
      }
      else callback(err + "\n" + stderr);
    });
  };

  this.isSigned = function(callback) {
    command('I', this.args, callback);
  };

  // PRIVATE
  function escape(str) {
    return '"' + str + '"';
  }

  function command(c, args, callback) {
    var argsStr = "";
    for (var i = 0; i < args.length; i++) {
      argsStr += " -" + args[i].opt;
      if(args[i].value){
        argsStr += " " + args[i].value;
      }
    }
    call(c, argsStr, callback);
  }

  function call(c, args, callback) {
    // var cmd = 'java -Xdebug -Xrunjdwp:transport=dt_socket,suspend=n,address=8044 -jar '+ JPGP_JAR + ' -' + c + args;
    var cmd = 'java -jar '+ JPGP_JAR + ' -' + c + args;
    var start = new Date();
    exec(cmd, function (err, stdout, stderr) {
      var end = new Date();
      var diff = end.getTime() - start.getTime();
      console.log("jpgp -" + c, diff + " ms");
      callback(err, stdout, stderr);
    });
  }
}

module.exports = function () {
  return new JPGP();
};
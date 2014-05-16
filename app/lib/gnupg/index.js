var async  = require('async');
var logger = require('../logger')();

module.exports = function GPG(privateKey, passphrase, fingerprint, keyring, done) {

  var spawn = require('child_process').spawn;
  var fs = require('fs');
  var privateKeyName = 'key' + Date.now();
  var gpgimport = __dirname + '/gpg-import.sh ';
  var gpgsh = __dirname + '/gpg.sh';

  this.init = function (done) {
    async.waterfall([
      function (next){
        fs.writeFile(privateKeyName, privateKey, { encoding: 'utf8'}, next);
      },
      function (next){
        var exec = require('child_process').exec;
        exec(gpgimport + keyring + ' ' + privateKeyName, function (error, stdout, stderr) {
          fs.unlink(privateKeyName, function (errUnlink) {
            next(errUnlink);
          });
        });
      },
    ], done);
  };

  /**
  * Signature functions
  */
  this.sign      = async.apply(doSign, '-sba');
  this.clearsign = async.apply(doSign, '--clearsign');

  function doSign (options, message, callback) {
    try{
      var signature = '';
      var child = spawn(gpgsh, [keyring, fingerprint, options], { env: { MESSAGE: message }});

      child.stdin.write(passphrase);
      child.stdin.end();

      child.stderr.setEncoding('utf8');
      child.stderr.on('data', function (data) {
        logger.error(data);
        if (/^execvp\(\)/.test(data)) {
          logger.debug('Failed to start gpg process.');
        }
      });

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', function (data) {
        signature += data;
      });

      child.on('close', function () {
        //pgplogger.debug(signature);
        callback(null, signature.toString());
      });
    }
    catch(ex){
      callback(ex.toString());
    }
  }
};

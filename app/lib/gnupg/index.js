var async  = require('async');
var logger = require('../logger')();

module.exports = function GPG(privateKey, passphrase, keyring, done) {
  
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

  this.sign = function (message, callback) {
    try{
      var strippedMessage = message
        .replace(/\\r\\n/g, '\\\\r\\\\n')
        .replace(/\r\n/g, '\n')
        .replace(/\n/g, '\r\n')
        .replace(/\r\n/g, '\\r\\n')
        .replace(/\t/g, '\\t')
        .replace(/ /g, '\\s');
      var signature = '';
      var child = spawn(gpgsh, [keyring], { env: {MESSAGE: message.unix2dos() }});

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

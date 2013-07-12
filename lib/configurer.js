var async = require('async');
var fs    = require('fs');

function Configurer(config) {

  this.config = config;

  this.parseFiles = function (callback) {
    var obj = this;
    if (obj.config.initKeys) {
      async.forEach(obj.config.initKeys, function(file, done){
        fs.readFile(file.path, {encoding: "utf8"}, function (err, data) {
          file.data = data;
          done(err);
        });
      },
      callback);
    }
    else{
      callback();
    }
    return this;
  };
}

module.exports = function (config) {
  return new Configurer(config);
};
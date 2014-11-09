var wizard    = require('./wizard');
var constants = require('./constants');
var os        = require('os');
var async     = require('async');
var _         = require('underscore');
var inquirer  = require('inquirer');
var request   = require('request');

module.exports = function () {
  return new Wizard();
}

var IPV4_REGEXP = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/;
var IPV6_REGEXP = /^((([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}:[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){5}:([0-9A-Fa-f]{1,4}:)?[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){4}:([0-9A-Fa-f]{1,4}:){0,2}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){3}:([0-9A-Fa-f]{1,4}:){0,3}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){2}:([0-9A-Fa-f]{1,4}:){0,4}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|(([0-9A-Fa-f]{1,4}:){0,5}:((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|(::([0-9A-Fa-f]{1,4}:){0,5}((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|([0-9A-Fa-f]{1,4}::([0-9A-Fa-f]{1,4}:){0,5}[0-9A-Fa-f]{1,4})|(::([0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){1,7}:))$/;

function Wizard () {

  this.configAll = function (conf, done) {
    doTasks(['currency', 'network', 'key', 'ucp'], conf, done);
  };

  this.configCurrency = function (conf, done) {
    doTasks(['currency'], conf, done);
  };

  this.configNetwork = function (conf, done) {
    doTasks(['network'], conf, done);
  };

  this.configKey = function (conf, done) {
    doTasks(['key'], conf, done);
  };

  this.configUCP = function (conf, done) {
    doTasks(['ucp'], conf, done);
  };

  this.doTasks = function (todos, conf, done) {
    doTasks(todos, conf, done);
  };
}

function doTasks (todos, conf, done) {
  async.forEachSeries(todos, function(task, callback){
    tasks[task] && tasks[task](conf, callback);
  }, done);
}

var tasks = {

  currency: function (conf, done) {
    async.waterfall([
      function (next){
        inquirer.prompt([{
          type: "input",
          name: "currency",
          message: "Currency name",
          default: conf.currency,
          validate: function (input) {
            return input.match(/^[a-zA-Z0-9-_ ]+$/) ? true : false;
          }
        }], function (answers) {
          conf.currency = answers.currency;
          next();
        });
      },
      async.apply(simpleInteger, "First Universal Dividend (UD[0]) amount", "ud0", conf),
      async.apply(simpleFloat, "Universal Dividend %growth", "c", conf),
      async.apply(simpleInteger, "Universal Dividend period (in seconds)", "dt", conf),
    ], done);
  },

  network: function (conf, done) {
    var noInterfaceListened = true;
    if (conf.ipv4 || conf.ipv6) {
      noInterfaceListened = false;
    }
    var remoteipv4 = null, remoteipv6 = null;
    // Tries to discover remote IPv4 & IPv6 addresses in background
    async.parallel({
      ipv4: function(callback){
        request('http://ifconfig.me/ip', function (err, res) {
          var ip = !err && res && res.body && res.body.unix2dos().replace('\r\n', '');
          remoteipv4 = ip && ip.match(IPV4_REGEXP) && ip;
          callback();
        });
      },
      ipv6: function(callback){
        request('http://icanhazip.com', function (err, res) {
          var ip = !err && res && res.body && res.body.unix2dos().replace('\r\n', '');
          remoteipv6 = ip && ip.match(IPV6_REGEXP) && ip;
          callback();
        });
      },
    });
    // Starts config
    async.waterfall([
      function (next){
        var osInterfaces = os.networkInterfaces();
        var interfaces = [{ name: "None", value: null }];
        _(osInterfaces).keys().forEach(function(interfaceName){
          var addresses = osInterfaces[interfaceName];
          var filtered = _(addresses).where({family: 'IPv4'});
          filtered.forEach(function(addr){
            interfaces.push({
              name: [interfaceName, addr.address].join(' '),
              value: addr.address
            });
          });
        });
        inquirer.prompt([{
          type: "list",
          name: "ipv4",
          message: "IPv4 interface",
          default: conf.ipv4,
          choices: interfaces
        }], function (answers) {
          conf.ipv4 = answers.ipv4;
          next();
        });
      },
      function (next){
        var osInterfaces = os.networkInterfaces();
        var interfaces = [{ name: "None", value: null }];
        _(osInterfaces).keys().forEach(function(interfaceName){
          var addresses = osInterfaces[interfaceName];
          var filtered = _(addresses).where({family: 'IPv6'});
          filtered.forEach(function(addr){
            interfaces.push({
              name: [interfaceName, addr.address].join(' '),
              value: addr.address
            });
          });
        });
        inquirer.prompt([{
          type: "list",
          name: "ipv6",
          message: "IPv6 interface",
          default: conf.ipv6,
          choices: interfaces
        }], function (answers) {
          conf.ipv6 = answers.ipv6;
          next();
        });
      },
      async.apply(simpleInteger, "Port", "port", conf),
      function (next){
        var choices = [{ name: "None", value: null }];
        if (conf.remoteipv4) {
          choices.push({ name: conf.remoteipv4, value: conf.remoteipv4 });
        }
        if (remoteipv4)
          choices.push({ name: remoteipv4, value: remoteipv4 });
        choices.push({ name: "Enter new one", value: "new" });
        inquirer.prompt([{
          type: "list",
          name: "remoteipv4",
          message: "Remote IPv4",
          default: conf.remoteipv4 || null,
          choices: choices,
          validate: function (input) {
            return input && input.toString().match(IPV4_REGEXP) ? true : false;
          }
        }], function (answers) {
          if (answers.remoteipv4 == "new") {
            inquirer.prompt([{
              type: "input",
              name: "remoteipv4",
              message: "Remote IPv4",
              default: conf.remoteipv4 || conf.ipv4,
              validate: function (input) {
                return input && input.toString().match(IPV4_REGEXP) ? true : false;
              }
            }], async.apply(next, null));
          } else {
            next(null, answers);
          }
        });
      },
      function (answers, next){
        conf.remoteipv4 = answers.remoteipv4;
        var choices = [{ name: "None", value: null }];
        if (conf.remoteipv6) {
          choices.push({ name: conf.remoteipv6, value: conf.remoteipv6 });
        }
        if (remoteipv6)
          choices.push({ name: remoteipv6, value: remoteipv6 });
        choices.push({ name: "Enter new one", value: "new" });
        inquirer.prompt([{
          type: "list",
          name: "remoteipv6",
          message: "Remote IPv6",
          default: conf.remoteipv6 || null,
          choices: choices,
          validate: function (input) {
            return input && input.toString().match(IPV6_REGEXP) ? true : false;
          }
        }], function (answers) {
          if (answers.remoteipv6 == "new") {
            inquirer.prompt([{
              type: "input",
              name: "remoteipv6",
              message: "Remote IPv6",
              default: conf.remoteipv6 || conf.ipv6,
              validate: function (input) {
                return input && input.toString().match(IPV6_REGEXP) ? true : false;
              }
            }], function (answers) {
              conf.remoteipv6 = answers.remoteipv6;
              next();
            });
          } else {
            next();
          }
        });
      },
      async.apply(simpleInteger, "Remote port", "remoteport", conf),
    ], done);
  },

  key: function (conf, done) {
    async.waterfall([
      function (next){
        inquirer.prompt([{
          type: "input",
          name: "salt",
          message: "Key's salt",
          default: conf.salt,
          validate: function (input) {
            return input.match(constants.SALT) ? true : false;
          }
        }], function (answers) {
          conf.salt = answers.salt;
          next();
        });
      },
      function (next) {
        inquirer.prompt([{
          type: "password",
          name: "passwd",
          message: "Key\'s password",
          validate: function (input) {
            return input.match(constants.PASSWORD) ? true : false;
          }
        }], function (answers) {
          conf.passwd = answers.passwd;
          next();
        });
      }
    ], done);
  },

  ucp: function (conf, done) {
    async.waterfall([
      async.apply(simpleInteger, "Delay between 2 identical certifications", "sigDelay", conf),
      async.apply(simpleInteger, "Membership validity duration", "msValidity", conf),
      async.apply(simpleInteger, "Certification validity duration", "sigValidity", conf),
      async.apply(simpleInteger, "Number of valid certifications required to be a member", "sigQty", conf),
      async.apply(simpleInteger, "Minimum number of leading zeros for a proof-of-work", "powZeroMin", conf),
      async.apply(simpleInteger, "Number of confirmation to change current Date", "incDateMin", conf),
      async.apply(simpleInteger, "Increment value (in seconds) for date changing", "dtDateMin", conf),
      function (next){
        choose("Participate writing the blockchain (when member)", conf.participate,
          function participate () {
            conf.participate = true;
            next();
          },
          function doNotParticipate () {
            conf.participate = false;
            next();
          });
      },
      async.apply(simpleInteger, "Start computation of a new block if none received since (seconds)", "powDelay", conf),
    ], done);
  }
};

function choose (question, defaultValue, ifOK, ifNotOK) {
  inquirer.prompt([{
    type: "confirm",
    name: "q",
    message: question,
    default: defaultValue,
  }], function (answer) {
    answer.q ? ifOK() : ifNotOK();
  });
}

function simpleValue (question, property, defaultValue, conf, validation, done) {
  inquirer.prompt([{
    type: "input",
    name: property,
    message: question,
    default: conf[property],
    validate: validation
  }], function (answers) {
    conf[property] = answers[property];
    done();
  });
}

function simpleInteger (question, property, conf, done) {
  simpleValue(question, property, conf[property], conf, function (input) {
    return input && input.toString().match(/^[0-9]+$/) ? true : false;
  }, done);
}

function simpleFloat (question, property, conf, done) {
  simpleValue(question, property, conf[property], conf, function (input) {
    return input && input.toString().match(/^[0-9]+(\.[0-9]+)?$/) ? true : false;
  }, done);
}

function simplePercentOrPositiveInteger (question, property, conf, done) {
  simpleValue(question, property, conf[property], conf, function (input) {
    return input && (input.toString().match(/^[1-9][0-9]*$/) || input.toString().match(/^0\.[0-9]+$/)) ? true : false;
  }, done);
}
var wizard    = require('./wizard');
var constants = require('./constants');
var os        = require('os');
var async     = require('async');
var _         = require('underscore');
var inquirer  = require('inquirer');
var request   = require('request');
var upnp      = require('nat-upnp');

module.exports = function () {
  return new Wizard();
}

var IPV4_REGEXP = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/;
var IPV6_REGEXP = /^((([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}:[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){5}:([0-9A-Fa-f]{1,4}:)?[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){4}:([0-9A-Fa-f]{1,4}:){0,2}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){3}:([0-9A-Fa-f]{1,4}:){0,3}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){2}:([0-9A-Fa-f]{1,4}:){0,4}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|(([0-9A-Fa-f]{1,4}:){0,5}:((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|(::([0-9A-Fa-f]{1,4}:){0,5}((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|([0-9A-Fa-f]{1,4}::([0-9A-Fa-f]{1,4}:){0,5}[0-9A-Fa-f]{1,4})|(::([0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){1,7}:))$/;

function Wizard () {

  this.configAll = function (conf, done) {
    doTasks(['currency', 'network', 'key', 'pow', 'ucp'], conf, done);
  };

  this.configBasic = function (conf, done) {
    doTasks(['key', 'network', 'pow'], conf, done);
  };

  this.configPoW = function (conf, done) {
    doTasks(['pow'], conf, done);
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

  this.choose = choose;
  this.automaticNetworkConfiguration = automaticNetworkConfiguration;
  this.manualNetworkConfiguration = manualNetworkConfiguration;
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
      }
    ], done);
  },

  network: function (conf, done) {
    async.waterfall([
      function(next) {
        choose("Network: use automatic configuration?", conf.autoconf,
          async.apply(automaticNetworkConfiguration, conf, next),
          async.apply(manualNetworkConfiguration, conf, next));
      }
    ], done);
  },

  key: function (conf, done) {
    async.waterfall([
      function (next){
        inquirer.prompt([{
          type: "input",
          name: "salt",
          message: "Key's salt",
          default: conf.salt ? conf.salt : undefined,
          validate: function (input) {
            return input.match(constants.SALT) ? true : false;
          }
        }], function (answers) {
          conf.salt = answers.salt;
          next();
        });
      },
      function (next) {
        var obfuscated = conf.passwd.replace(/./g, '*');
        inquirer.prompt([{
          type: "password",
          name: "passwd",
          message: "Key\'s password",
          default: obfuscated ? obfuscated : undefined,
          validate: function (input) {
            return input.match(constants.PASSWORD) ? true : false;
          }
        }], function (answers) {
          var keepOld = obfuscated.length > 0 && obfuscated == answers.passwd;
          conf.passwd = keepOld ? conf.passwd : answers.passwd;
          next();
        });
      }
    ], done);
  },

  ucp: function (conf, done) {
    async.waterfall([
      async.apply(simpleFloat,   "Universal Dividend %growth",                                             "c", conf),
      async.apply(simpleInteger, "Universal Dividend period (in seconds)",                                 "dt", conf),
      async.apply(simpleInteger, "First Universal Dividend (UD[0]) amount",                                "ud0", conf),
      async.apply(simpleInteger, "Delay between 2 identical certifications",                               "sigDelay", conf),
      async.apply(simpleInteger, "Certification validity duration",                                        "sigValidity", conf),
      async.apply(simpleInteger, "Number of valid certifications required to be a member",                 "sigQty", conf),
      async.apply(simpleInteger, "Number of valid emitted certifications to be a distance checked member", "sigWoT", conf),
      async.apply(simpleInteger, "Membership validity duration",                                           "msValidity", conf),
      async.apply(simpleInteger, "Number of blocks on which is computed median time",                      "medianTimeBlocks", conf),
      async.apply(simpleInteger, "The average time for writing 1 block (wished time)",                     "avgGenTime", conf),
      async.apply(simpleInteger, "Frequency, in number of blocks, to wait for changing common difficulty", "dtDiffEval", conf),
      async.apply(simpleInteger, "Number of blocks to check in past for deducing personalized difficulty", "blocksRot", conf),
      async.apply(simpleFloat,   "Weight in percent for previous issuers",                                 "percentRot", conf),
    ], done);
  },

  pow: function (conf, done) {
    async.waterfall([
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
      function (next) {
        if (conf.participate) {
          simpleInteger("Start computation of a new block if none received since (seconds)", "powDelay", conf, next);
        }
        else next();
      }
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

function automaticNetworkConfiguration(conf, done) {
  if(conf.autoconf) {
    done();
  } else {
    conf.autoconf = true;
    var client = upnp.createClient();
    var privateIP = null, publicIP = null;
    // Look for 2 random ports
    var privatePort = ~~(Math.random() * (65536 - constants.NETWORK.PORT.START)) + constants.NETWORK.PORT.START;
    var publicPort = ~~(Math.random() * (65536 - constants.NETWORK.PORT.START)) + constants.NETWORK.PORT.START;
    async.waterfall([
      function (next) {
        client.externalIp(next);
      },
      function (ip, next) {
        publicIP = ip;
        next();
      },
      function(next) {
        client.portMapping({
          public: publicPort,
          private: privatePort,
          ttl: 120
        }, next);
      },
      function(res, next) {
        client.findGateway(next);
      },
      function(res, localIP, next) {
        privateIP = localIP;
        console.log('-----------');
        console.log('Remote access:', [publicIP, publicPort].join(':'));
        console.log('Local access:', [privateIP, privatePort].join(':'));
        console.log('-----------');
        conf.remoteipv4 = publicIP.match(IPV4_REGEXP) ? publicIP : null;
        conf.remoteipv6 = publicIP.match(IPV6_REGEXP) ? publicIP : null;
        conf.remoteport = publicPort;
        conf.port = privatePort;
        conf.ipv4 = privateIP.match(IPV4_REGEXP) ? privateIP : null;
        conf.ipv6 = privateIP.match(IPV6_REGEXP) ? privateIP : null;
        next();
      }
    ], done);
  }
}

function manualNetworkConfiguration(conf, done) {
  var remoteipv4 = null, remoteipv6 = null;
  var client = upnp.createClient();
  conf.autoconf = false;

  // Tries to discover remote IPv4 address in background
  async.parallel({
    ipv4: function(callback){
      client.externalIp(function (err, remoteIp) {
        var ip = !err && remoteIp;
        remoteipv4 = ip && ip.match(IPV4_REGEXP) && ip;
        callback();
      });
    }
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
      // Local interfaces
      var osInterfaces = os.networkInterfaces();
      _(osInterfaces).keys().forEach(function(interfaceName){
        var addresses = osInterfaces[interfaceName];
        var filtered = _(addresses).where({family: 'IPv4'});
        filtered.forEach(function(addr){
          choices.push({
            name: [interfaceName, addr.address].join(' '),
            value: addr.address
          });
        });
      });
      // Remote interfaces
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
        default: conf.remoteipv4 || conf.ipv4 || null,
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
    function(next) {
      choose("Network: use UPnP to open remote port? (easier)", conf.upnp,
        function() {
          conf.upnp = true;
          next();
        },
        function() {
          conf.upnp = false;
          next();
        });
    }
  ], done);
}
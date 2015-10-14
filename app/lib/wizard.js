"use strict";
var wizard    = require('./wizard');
var constants = require('./constants');
var os        = require('os');
var async     = require('async');
var _         = require('underscore');
var inquirer  = require('inquirer');
var request   = require('request');
var upnp      = require('nat-upnp');
var logger    = require('../lib/logger')('wizard');

module.exports = function () {
  return new Wizard();
};

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

  this.configNetworkReconfigure = function (conf, done) {
    doTasks(['networkReconfigure'], conf, done);
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
  this.networkConfiguration = networkConfiguration;
  this.networkReconfiguration = networkReconfiguration;
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
    networkConfiguration(conf, done);
  },

  networkReconfigure: function (conf, done) {
    networkReconfiguration(conf, done);
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
        var obfuscated = (conf.passwd || "").replace(/./g, '*');
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
    default: defaultValue
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

function upnpResolve(noupnp, done) {
  var conf = {};
  var client = upnp.createClient();
  var privateIP = null, publicIP = null;
  // Look for 2 random ports
  var privatePort = ~~(Math.random() * (65536 - constants.NETWORK.PORT.START)) + constants.NETWORK.PORT.START;
  var publicPort = privatePort;
  logger.info('Checking UPnP features...');
  async.waterfall([
    function (next) {
      if (noupnp) {
        return next('No UPnP');
      }
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
      conf.remoteipv4 = publicIP.match(IPV4_REGEXP) ? publicIP : null;
      conf.remoteipv6 = publicIP.match(IPV6_REGEXP) ? publicIP : null;
      conf.remoteport = publicPort;
      conf.port = privatePort;
      conf.ipv4 = privateIP.match(IPV4_REGEXP) ? privateIP : null;
      conf.ipv6 = privateIP.match(IPV6_REGEXP) ? privateIP : null;
      next();
    }
  ], function(err) {
    done(null, !err, conf);
  });
}

function networkConfiguration(conf, done) {
  async.waterfall([
    upnpResolve,
    function(upnpSuccess, upnpConf, next) {

      var operations = getLocalNetworkOperations(conf)
        .concat(getRemoteNetworkOperations(conf));

      if (upnpSuccess) {
        operations = operations.concat(getUseUPnPOperations(conf));
      }

      async.waterfall(operations, next);
    }
  ], done);
}

function networkReconfiguration(conf, autoconf, noupnp, done) {
  async.waterfall([
    upnpResolve.bind(this, noupnp),
    function(upnpSuccess, upnpConf, next) {

      // Default values
      conf.port = conf.port || constants.NETWORK.DEFAULT_PORT;
      conf.remoteport = conf.remoteport || constants.NETWORK.DEFAULT_PORT;

      var localOperations = getLocalNetworkOperations(conf, autoconf);
      var remoteOpertions = getRemoteNetworkOperations(conf, upnpConf.remoteipv4, upnpConf.remoteipv6, autoconf);
      var dnsOperations = getHostnameOperations(conf, autoconf);
      var useUPnPOperations = getUseUPnPOperations(conf, autoconf);

      if (upnpSuccess) {
        _.extend(conf, upnpConf);
        var local = [conf.ipv4, conf.port].join(':');
        var remote = [conf.remoteipv4, conf.remoteport].join(':');
        if (autoconf) {
          logger.info('Local IPv4: %s', local);
          logger.info('Remote IPv4: %s', remote);
          // Use proposed local + remote with UPnP binding
          return async.waterfall(useUPnPOperations
            .concat(dnsOperations), next);
        }
        choose("UPnP is available: ucoin will be bound: \n  from " + local + "\n  to " + remote + "\nKeep this configuration?", true,
          function () {
            // Yes: not network changes
            async.waterfall(useUPnPOperations
              .concat(dnsOperations), next);
          },
          function () {
            // No: want to change
            async.waterfall(
              localOperations
                .concat(remoteOpertions)
                .concat(useUPnPOperations)
                .concat(dnsOperations), next);
          });
      } else {
        conf.upnp = false;
        if (autoconf) {
          // Yes: local configuration = remote configuration
          return async.waterfall(
            localOperations
              .concat(getHostnameOperations(conf, autoconf))
              .concat([function (confDone) {
                conf.remoteipv4 = conf.ipv4;
                conf.remoteipv6 = conf.ipv6;
                conf.remoteport = conf.port;
                logger.info('Local & Remote IPv4: %s', [conf.ipv4, conf.port].join(':'));
                logger.info('Local & Remote IPv6: %s', [conf.ipv6, conf.port].join(':'));
                confDone();
              }]), next);
        }
        choose("UPnP is *not* available: is this a public server (like a VPS)?", true,
          function () {
            // Yes: local configuration = remote configuration
            async.waterfall(
              localOperations
                .concat(getHostnameOperations(conf))
                .concat([function(confDone) {
                  conf.remoteipv4 = conf.ipv4;
                  conf.remoteipv6 = conf.ipv6;
                  conf.remoteport = conf.port;
                  confDone();
                }]), next);
          },
          function () {
            // No: must give all details
            async.waterfall(
              localOperations
                .concat(remoteOpertions)
                .concat(dnsOperations), next);
          });
      }
    }
  ], done);
}

function getLocalNetworkOperations(conf, autoconf) {
  return [
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
      if (autoconf) {
        conf.ipv4 = _.sortBy(interfaces, function(entry) {
          if (entry.name.match(/^eth0/)) return 0;
          if (entry.name.match(/^eth1/)) return 1;
          if (entry.name.match(/^eth2/)) return 2;
          if (entry.name.match(/^wlan0/)) return 3;
          if (entry.name.match(/^wlan1/)) return 4;
          if (entry.name.match(/^wlan2/)) return 5;
          if (entry.name.match(/^lo/)) return 6;
          if (entry.name.match(/^None/)) return 7;
          return 10;
        })[0].value;
        return next();
      }
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
      if (autoconf) {
        conf.ipv6 = _.sortBy(interfaces, function(entry) {
          if (entry.name.match(/^eth0/)) return 0;
          if (entry.name.match(/^eth1/)) return 1;
          if (entry.name.match(/^eth2/)) return 2;
          if (entry.name.match(/^wlan0/)) return 3;
          if (entry.name.match(/^wlan1/)) return 4;
          if (entry.name.match(/^wlan2/)) return 5;
          if (entry.name.match(/^lo/)) return 6;
          if (entry.name.match(/^None/)) return 7;
          return 10;
        })[0].value;
        return next();
      }
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
    autoconf ? (done) => done() : async.apply(simpleInteger, "Port", "port", conf)
  ];
}

function getRemoteNetworkOperations(conf, remoteipv4, remoteipv6, autoconf) {
  return [
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
      if (conf.remoteipv4) {
        choices.push({ name: conf.remoteipv4, value: conf.remoteipv4 });
      }
      if (remoteipv4 && remoteipv4 != conf.remoteipv4) {
        choices.push({ name: remoteipv4, value: remoteipv4 });
      }
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
      if (remoteipv6 && remoteipv6 != conf.remoteipv6) {
        choices.push({ name: remoteipv6, value: remoteipv6 });
      }
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
    async.apply(simpleInteger, "Remote port", "remoteport", conf)
  ];
}

function getHostnameOperations(conf, autoconf) {
  return [function(next) {
    if (autoconf) {
      logger.info('DNS: %s', conf.remotehost || 'No');
      return next();
    }
    choose("Does this server has a DNS name?", !!conf.remotehost,
      function() {
        // Yes
        simpleValue("DNS name:", "remotehost", "", conf, function(){ return true; }, next);
      },
      function() {
        conf.remotehost = null;
        next();
      });
  }];
}

function getUseUPnPOperations(conf, autoconf) {
  return [function(next) {
    if (autoconf) {
      logger.info('UPnP: %s', 'Yes');
      conf.upnp = true;
      return next();
    }
    choose("UPnP is available: use automatic port mapping? (easier)", conf.upnp,
      function() {
        conf.upnp = true;
        next();
      },
      function() {
        conf.upnp = false;
        next();
      });
  }];
}

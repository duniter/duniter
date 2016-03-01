"use strict";
var co        = require('co');
var Q         = require('q');
var constants = require('./constants');
var network   = require('./network');
var async     = require('async');
var _         = require('underscore');
var inquirer  = require('inquirer');
var logger    = require('../lib/logger')('wizard');

module.exports = function () {
  return new Wizard();
};

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

  this.networkReconfiguration = networkReconfiguration;
  this.keyReconfigure = keyReconfigure;
}

function keyReconfigure(conf, autoconf, done) {
  return co(function *() {
    if (autoconf) {
      conf.salt = ~~(Math.random() * 2147483647) + "";
      conf.passwd = ~~(Math.random() * 2147483647) + "";
      logger.info('Key: %s', 'generated');
    } else {
      yield Q.Promise(function(resolve, reject){
        choose('You need a keypair to identify your node on the network. Would you like to automatically generate it?', true,
          function(){
            conf.salt = ~~(Math.random() * 2147483647) + "";
            conf.passwd = ~~(Math.random() * 2147483647) + "";
            resolve();
          },
          function(){
            doTasks(['key'], conf, (err) => err ? reject(err) : resolve());
          });
      });
    }
    done();
  })
    .catch(done);
}

function doTasks (todos, conf, done) {
  async.forEachSeries(todos, function(task, callback){
    if (task == 'networkReconfigure') {
      return tasks[task] && tasks[task](conf, false, false, callback);
    }
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

  networkReconfigure: function (conf, autoconf, noupnp, done) {
    networkReconfiguration(conf, autoconf, noupnp, done);
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
      async.apply(simpleInteger, "Delay between 2 certifications of a same issuer",                        "sigPeriod", conf),
      async.apply(simpleInteger, "Maximum stock of valid certifications per member",                       "sigStock", conf),
      async.apply(simpleInteger, "Maximum age of a non-written certification",                             "sigWindow", conf),
      async.apply(simpleInteger, "Certification validity duration",                                        "sigValidity", conf),
      async.apply(simpleInteger, "Number of valid certifications required to be a member",                 "sigQty", conf),
      async.apply(simpleFloat,   "Percentage of sentries to be reached to match WoT distance rule",        "xpercent", conf),
      async.apply(simpleInteger, "Membership validity duration",                                           "msValidity", conf),
      async.apply(simpleInteger, "Number of blocks on which is computed median time",                      "medianTimeBlocks", conf),
      async.apply(simpleInteger, "The average time for writing 1 block (wished time)",                     "avgGenTime", conf),
      async.apply(simpleInteger, "Frequency, in number of blocks, to wait for changing common difficulty", "dtDiffEval", conf),
      async.apply(simpleInteger, "Number of blocks to check in past for deducing personalized difficulty", "blocksRot", conf),
      async.apply(simpleFloat,   "Weight in percent for previous issuers",                                 "percentRot", conf)
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

function upnpResolve(noupnp, done) {
  return co(function *() {
    try {
      let conf = yield network.upnpConf(noupnp);
      done(null, false, conf);
    } catch (err) {
      done(null, true, {});
    }
  });
}

function networkConfiguration(conf, done) {
  async.waterfall([
    upnpResolve.bind(this, !conf.upnp),
    function(upnpSuccess, upnpConf, next) {

      var operations = getLocalNetworkOperations(conf)
        .concat(getRemoteNetworkOperations(conf));

      if (upnpSuccess) {
        operations = operations.concat(getUseUPnPOperations(conf));
      }

      async.waterfall(operations.concat(getHostnameOperations(conf, false)), next);
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
      var osInterfaces = network.listInterfaces();
      var interfaces = [{ name: "None", value: null }];
      osInterfaces.forEach(function(netInterface){
        var addresses = netInterface.addresses;
        var filtered = _(addresses).where({family: 'IPv4'});
        filtered.forEach(function(addr){
          interfaces.push({
            name: [netInterface.name, addr.address].join(' '),
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
      var osInterfaces = network.listInterfaces();
      var interfaces = [{ name: "None", value: null }];
      osInterfaces.forEach(function(netInterface){
        var addresses = netInterface.addresses;
        var filtered = _(addresses).where({family: 'IPv6'});
        filtered.forEach(function(addr){
          interfaces.push({
            name: [netInterface.name, addr.address].join(' '),
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
    autoconf ? (done) => {
      conf.port = network.getRandomPort();
      done();
    } : async.apply(simpleInteger, "Port", "port", conf)
  ];
}

function getRemoteNetworkOperations(conf, remoteipv4, remoteipv6, autoconf) {
  return [
    function (next){
      var choices = [{ name: "None", value: null }];
      // Local interfaces
      var osInterfaces = network.listInterfaces();
      osInterfaces.forEach(function(netInterface){
        var addresses = netInterface.addresses;
        var filtered = _(addresses).where({family: 'IPv4'});
        filtered.forEach(function(addr){
          choices.push({
            name: [netInterface.name, addr.address].join(' '),
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
          return input && input.toString().match(constants.IPV4_REGEXP) ? true : false;
        }
      }], function (answers) {
        if (answers.remoteipv4 == "new") {
          inquirer.prompt([{
            type: "input",
            name: "remoteipv4",
            message: "Remote IPv4",
            default: conf.remoteipv4 || conf.ipv4,
            validate: function (input) {
              return input && input.toString().match(constants.IPV4_REGEXP) ? true : false;
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
          return input && input.toString().match(constants.IPV6_REGEXP) ? true : false;
        }
      }], function (answers) {
        if (answers.remoteipv6 == "new") {
          inquirer.prompt([{
            type: "input",
            name: "remoteipv6",
            message: "Remote IPv6",
            default: conf.remoteipv6 || conf.ipv6,
            validate: function (input) {
              return input && input.toString().match(constants.IPV6_REGEXP) ? true : false;
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

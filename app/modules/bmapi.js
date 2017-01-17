"use strict";

const Q = require('q');
const co = require('co');
const os = require('os');
const async = require('async');
const _ = require('underscore');
const util = require('util');
const stream = require('stream');
const constants = require('../lib/constants');
const upnp = require('../lib/system/upnp');
const inquirer = require('inquirer');

module.exports = {
  duniter: {

    cliOptions: [
      { value: '--upnp', desc: 'Use UPnP to open remote port.' },
      { value: '--noupnp', desc: 'Do not use UPnP to open remote port.' }
    ],

    wizard: {

      'network': (conf, program) => co(function*() {
        yield Q.nbind(networkConfiguration, null, conf)();
      }),

      'network-reconfigure': (conf, program) => co(function*() {
        yield Q.nbind(networkReconfiguration, null, conf, program.autoconf, program.noupnp)();
      })
    },

    config: {

      onLoading: (conf, program) => co(function*(){

        // Network autoconf
        const autoconfNet = program.autoconf
          || !(conf.ipv4 || conf.ipv6)
          || !(conf.remoteipv4 || conf.remoteipv6 || conf.remotehost)
          || !(conf.port && conf.remoteport);
        if (autoconfNet) {
          yield Q.nbind(networkReconfiguration, null)(conf, autoconfNet, program.noupnp);
        }

        // Default value
        if (conf.upnp === undefined || conf.upnp === null) {
          conf.upnp = true; // Defaults to true
        }

        // UPnP
        if (program.noupnp === true) {
          conf.upnp = false;
        }
        if (program.upnp === true) {
          conf.upnp = true;
        }
      })
    },

    service: {
      input: () => new BMAPI()
    },

    methods: {
      upnpConf, listInterfaces, getBestLocalIPv4, getBestLocalIPv6, getRandomPort
    }
  }
}

function BMAPI() {

  // Public http interface
  let bmapi;
  // UPnP API
  let upnpAPI;
  let logger;

  stream.Transform.call(this, { objectMode: true });

  this.startService = (server, conf) => co(function*() {
    logger = server.logger;
    const bma = require('../lib/streams/bma');
    bmapi = yield bma(server, null, conf.httplogs);
    yield bmapi.openConnections();

    /***************
     *    UPnP
     **************/
    if (conf.upnp) {
      try {
        if (upnpAPI) {
          upnpAPI.stopRegular();
        }
        upnpAPI = yield upnp(conf.port, conf.remoteport);
        upnpAPI.startRegular();
      } catch (e) {
        logger.warn(e);
      }
    }
  });

  this.stopService = () => co(function*() {
    yield bmapi.closeConnections();
    if (upnpAPI) {
      upnpAPI.stopRegular();
    }
  });
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
          conf.ipv6 = conf.remoteipv6 = getBestLocalIPv6();
          console.log('IPv6: %s', conf.ipv6 || "");
          console.log('Local IPv4: %s', local);
          console.log('Remote IPv4: %s', remote);
          // Use proposed local + remote with UPnP binding
          return async.waterfall(useUPnPOperations
            .concat(dnsOperations), next);
        }
        choose("UPnP is available: duniter will be bound: \n  from " + local + "\n  to " + remote + "\nKeep this configuration?", true,
          function () {
            // Yes: not network changes
            conf.ipv6 = conf.remoteipv6 = getBestLocalIPv6();
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
                console.log('Local & Remote IPv4: %s', [conf.ipv4, conf.port].join(':'));
                console.log('Local & Remote IPv6: %s', [conf.ipv6, conf.port].join(':'));
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


function upnpResolve(noupnp, done) {
  return co(function *() {
    try {
      let conf = yield upnpConf(noupnp);
      done(null, true, conf);
    } catch (err) {
      done(null, false, {});
    }
  });
}

function networkConfiguration(conf, done) {
  async.waterfall([
    upnpResolve.bind(this, !conf.upnp),
    function(upnpSuccess, upnpConf, next) {

      var operations = getLocalNetworkOperations(conf)
        .concat(getRemoteNetworkOperations(conf, upnpConf.remoteipv4, upnpConf.remoteipv6));

      if (upnpSuccess) {
        operations = operations.concat(getUseUPnPOperations(conf));
      }

      async.waterfall(operations.concat(getHostnameOperations(conf, false)), next);
    }
  ], done);
}

function getLocalNetworkOperations(conf, autoconf) {
  return [
    function (next){
      var osInterfaces = listInterfaces();
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
        conf.ipv4 = getBestLocalIPv4();
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
      var osInterfaces = listInterfaces();
      var interfaces = [{ name: "None", value: null }];
      osInterfaces.forEach(function(netInterface){
        var addresses = netInterface.addresses;
        var filtered = _(addresses).where({ family: 'IPv6' });
        filtered.forEach(function(addr){
          var address = addr.address
          if (addr.scopeid)
            address += "%" + netInterface.name
          let nameSuffix = "";
          if (addr.scopeid == 0 && !addr.internal) {
            nameSuffix = " (Global)";
          }
          interfaces.push({
            name: [netInterface.name, address, nameSuffix].join(' '),
            internal: addr.internal,
            scopeid: addr.scopeid,
            value: address
          });
        });
      });
      interfaces.sort((addr1, addr2) => {
        if (addr1.value === null) return -1;
        if (addr1.internal && !addr2.internal) return 1;
        if (addr1.scopeid && !addr2.scopeid) return 1;
        return 0;
      });
      if (autoconf || !conf.ipv6) {
        conf.ipv6 = conf.remoteipv6 = getBestLocalIPv6();
      }
      if (autoconf) {
        return next();
      }
      inquirer.prompt([{
        type: "list",
        name: "ipv6",
        message: "IPv6 interface",
        default: conf.ipv6,
        choices: interfaces
      }], function (answers) {
        conf.ipv6 = conf.remoteipv6 = answers.ipv6;
        next();
      });
    },
    autoconf ? (done) => {
        conf.port = getRandomPort(conf);
        done();
      } : async.apply(simpleInteger, "Port", "port", conf)
  ];
}

function getRemoteNetworkOperations(conf, remoteipv4) {
  return [
    function (next){
      if (!conf.ipv4) {
        conf.remoteipv4 = null;
        return next(null, {});
      }
      var choices = [{ name: "None", value: null }];
      // Local interfaces
      var osInterfaces = listInterfaces();
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
      return co(function*() {
        try {
          if (conf.remoteipv4 || conf.remotehost) {
            yield new Promise((resolve, reject) => {
              const getPort = async.apply(simpleInteger, "Remote port", "remoteport", conf);
              getPort((err) => {
                if (err) return reject(err);
                resolve();
              });
            });
          } else if (conf.remoteipv6) {
            conf.remoteport = conf.port;
          }
          next();
        } catch (e) {
          next(e);
        }
      });
    }
  ];
}

function getHostnameOperations(conf, autoconf) {
  return [function(next) {
    if (!conf.ipv4) {
      conf.remotehost = null;
      return next();
    }
    if (autoconf) {
      console.log('DNS: %s', conf.remotehost || 'No');
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
    if (!conf.ipv4) {
      conf.upnp = false;
      return next();
    }
    if (autoconf) {
      console.log('UPnP: %s', 'Yes');
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

function upnpConf (noupnp) {
  return co(function *() {
    const conf = {};
    const client = require('nnupnp').createClient();
    // Look for 2 random ports
    const privatePort = getRandomPort(conf);
    const publicPort = privatePort;
    console.log('Checking UPnP features...');
    if (noupnp) {
      throw Error('No UPnP');
    }
    const publicIP = yield Q.nbind(client.externalIp, client)();
    yield Q.nbind(client.portMapping, client)({
      public: publicPort,
      private: privatePort,
      ttl: 120
    });
    const privateIP = yield Q.Promise((resolve, reject) => {
      client.findGateway((err, res, localIP) => {
        if (err) return reject(err);
        resolve(localIP);
      });
    });
    conf.remoteipv4 = publicIP.match(constants.IPV4_REGEXP) ? publicIP : null;
    conf.remoteport = publicPort;
    conf.port = privatePort;
    conf.ipv4 = privateIP.match(constants.IPV4_REGEXP) ? privateIP : null;
    return conf;
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

function listInterfaces() {
  const netInterfaces = os.networkInterfaces();
  const keys = _.keys(netInterfaces);
  const res = [];
  for (const name of keys) {
    res.push({
      name: name,
      addresses: netInterfaces[name]
    });
  }
  return res;
}

function getBestLocalIPv4() {
  return getBestLocal('IPv4');
}

function getBestLocalIPv6() {
  const osInterfaces = listInterfaces();
  for (let netInterface of osInterfaces) {
    const addresses = netInterface.addresses;
    const filtered = _(addresses).where({family: 'IPv6', scopeid: 0, internal: false });
    const filtered2 = _(filtered).filter((address) => !address.address.match(/^fe80/) && !address.address.match(/^::1/));
    if (filtered2[0]) {
      return filtered2[0].address;
    }
  }
  return null;
}

function getBestLocal(family) {
  let netInterfaces = os.networkInterfaces();
  let keys = _.keys(netInterfaces);
  let res = [];
  for (const name of keys) {
    let addresses = netInterfaces[name];
    for (const addr of addresses) {
      if (!family || addr.family == family) {
        res.push({
          name: name,
          value: addr.address
        });
      }
    }
  }
  const interfacePriorityRegCatcher = [
    /^tun\d/,
    /^enp\ds\d/,
    /^enp\ds\df\d/,
    /^eth\d/,
    /^Ethernet/,
    /^wlp\ds\d/,
    /^wlan\d/,
    /^Wi-Fi/,
    /^lo/,
    /^Loopback/,
    /^None/
  ];
  const best = _.sortBy(res, function(entry) {
    for(let priority in interfacePriorityRegCatcher){
      if (entry.name.match(interfacePriorityRegCatcher[priority])) return priority;
    }
    return interfacePriorityRegCatcher.length;
  })[0];
  return (best && best.value) || "";
}

function getRandomPort(conf) {
  if (conf && conf.remoteport) {
    return conf.remoteport;
  } else {
    return ~~(Math.random() * (65536 - constants.NETWORK.PORT.START)) + constants.NETWORK.PORT.START;
  }
}

util.inherits(BMAPI, stream.Transform);

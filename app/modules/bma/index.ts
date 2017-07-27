"use strict";
import {NetworkConfDTO} from "../../lib/dto/ConfDTO"
import {Server} from "../../../server"
import * as stream from "stream"
import {BmaApi, Network} from "./lib/network"
import {UpnpApi} from "./lib/upnp"
import {BMAConstants} from "./lib/constants"
import {BMALimitation} from "./lib/limiter"

const Q = require('q');
const os = require('os');
const async = require('async');
const _ = require('underscore');
const upnp = require('./lib/upnp').Upnp
const bma = require('./lib/bma').bma
const dtos = require('./lib/dtos')
const sanitize = require('./lib/sanitize');
const http2raw = require('./lib/http2raw');
const inquirer = require('inquirer');

let networkWizardDone = false;

export const BmaDependency = {
  duniter: {

    cliOptions: [
      { value: '--upnp', desc: 'Use UPnP to open remote port.' },
      { value: '--noupnp', desc: 'Do not use UPnP to open remote port.' },
      { value: '-p, --port <port>', desc: 'Port to listen for requests', parser: (val:string) => parseInt(val) },
      { value: '--ipv4 <address>', desc: 'IPv4 interface to listen for requests' },
      { value: '--ipv6 <address>', desc: 'IPv6 interface to listen for requests' },
      { value: '--remoteh <host>', desc: 'Remote interface others may use to contact this node' },
      { value: '--remote4 <host>', desc: 'Remote interface for IPv4 access' },
      { value: '--remote6 <host>', desc: 'Remote interface for IPv6 access' },
      { value: '--remotep <port>', desc: 'Remote port others may use to contact this node' },
    ],

    wizard: {

      'network': async (conf:NetworkConfDTO, program:any, logger:any) => {
        await Q.nbind(networkConfiguration, null, conf, logger)()
        networkWizardDone = true;
      },

      'network-reconfigure': async (conf:NetworkConfDTO, program:any, logger:any) => {
        if (!networkWizardDone) {
          // This step can only be launched lonely
          await Q.nbind(networkReconfiguration, null)(conf, program.autoconf, logger, program.noupnp);
        }
      }
    },

    config: {

      onLoading: async (conf:NetworkConfDTO, program:any, logger:any) => {

        if (program.port !== undefined) conf.port = program.port;
        if (program.ipv4 !== undefined) conf.ipv4 = program.ipv4;
        if (program.ipv6 !== undefined) conf.ipv6 = program.ipv6;
        if (program.remoteh !== undefined) conf.remotehost = program.remoteh;
        if (program.remote4 !== undefined) conf.remoteipv4 = program.remote4;
        if (program.remote6 !== undefined) conf.remoteipv6 = program.remote6;
        if (program.remotep !== undefined) conf.remoteport = program.remotep;

        if (!conf.ipv4) delete conf.ipv4;
        if (!conf.ipv6) delete conf.ipv6;
        if (!conf.remoteipv4) delete conf.remoteipv4;
        if (!conf.remoteipv6) delete conf.remoteipv6;

        // Default remoteipv6: same as local if defined
        if (!conf.remoteipv6 && conf.ipv6) {
          conf.remoteipv6 = conf.ipv6;
        }
        // Fix #807: default remoteipv4: same as local ipv4 if no removeipv4 is not defined AND no DNS nor IPv6
        if (conf.ipv4 && !(conf.remoteipv4 || conf.remotehost || conf.remoteipv6)) {
          conf.remoteipv4 = conf.ipv4;
        }
        if (!conf.remoteport && conf.port) {
          conf.remoteport = conf.port;
        }

        // Network autoconf
        const autoconfNet = program.autoconf
          || !(conf.ipv4 || conf.ipv6)
          || !(conf.remoteipv4 || conf.remoteipv6 || conf.remotehost)
          || !(conf.port && conf.remoteport);
        if (autoconfNet) {
          await Q.nbind(networkReconfiguration, null)(conf, autoconfNet, logger, program.noupnp);
        }

        // Default value
        if (conf.upnp === undefined || conf.upnp === null) {
          conf.upnp = true; // Defaults to true
        }
        if (!conf.dos) {
          conf.dos = { whitelist: ['127.0.0.1'] };
          conf.dos.maxcount = 50;
          conf.dos.burst = 20;
          conf.dos.limit = conf.dos.burst * 2;
          conf.dos.maxexpiry = 10;
          conf.dos.checkinterval = 1;
          conf.dos.trustProxy = true;
          conf.dos.includeUserAgent = true;
          conf.dos.errormessage = 'Error';
          conf.dos.testmode = false;
          conf.dos.silent = false;
          conf.dos.silentStart = false;
          conf.dos.responseStatus = 429;
        }

        // UPnP
        if (program.noupnp === true) {
          conf.upnp = false;
        }
        if (program.upnp === true) {
          conf.upnp = true;
        }

        // Configuration errors
        if(!conf.ipv4 && !conf.ipv6){
          throw new Error("No interface to listen to.");
        }
        if(!conf.remoteipv4 && !conf.remoteipv6 && !conf.remotehost){
          throw new Error('No interface for remote contact.');
        }
        if (!conf.remoteport) {
          throw new Error('No port for remote contact.');
        }
      },

      beforeSave: async (conf:NetworkConfDTO, program:any) => {
        if (!conf.ipv4) delete conf.ipv4;
        if (!conf.ipv6) delete conf.ipv6;
        if (!conf.remoteipv4) delete conf.remoteipv4;
        if (!conf.remoteipv6) delete conf.remoteipv6;
        conf.dos.whitelist = _.uniq(conf.dos.whitelist);
      }
    },

    service: {
      input: (server:Server, conf:NetworkConfDTO, logger:any) => {
        server.getMainEndpoint = () => Promise.resolve(getEndpoint(conf))
        return new BMAPI(server, conf, logger)
      }
    },

    methods: {
      noLimit: () => BMALimitation.noLimit(),
      bma, sanitize, dtos,
      getMainEndpoint: (conf:NetworkConfDTO) => Promise.resolve(getEndpoint(conf))
    }
  }
}

export class BMAPI extends stream.Transform {

  // Public http interface
  private bmapi:BmaApi
  private upnpAPI:UpnpApi

  constructor(
    private server:Server,
    private conf:NetworkConfDTO,
    private logger:any) {
    super({ objectMode: true })
  }

  startService = async () => {
    this.bmapi = await bma(this.server, null, this.conf.httplogs, this.logger);
    await this.bmapi.openConnections();

    /***************
     *    UPnP
     **************/
    if (this.upnpAPI) {
      this.upnpAPI.stopRegular();
    }
    if (this.server.conf.upnp) {
      try {
        this.upnpAPI = await upnp(this.server.conf.port, this.server.conf.remoteport, this.logger);
        this.upnpAPI.startRegular();
        const gateway = await this.upnpAPI.findGateway();
        if (gateway) {
          if (this.bmapi.getDDOS().params.whitelist.indexOf(gateway) === -1) {
            this.bmapi.getDDOS().params.whitelist.push(gateway);
          }
        }
      } catch (e) {
        this.logger.warn(e);
      }
    }
  }

  stopService = async () => {
    if (this.bmapi) {
      await this.bmapi.closeConnections();
    }
    if (this.upnpAPI) {
      this.upnpAPI.stopRegular();
    }
  }
}

function getEndpoint(theConf:NetworkConfDTO) {
  let endpoint = 'BASIC_MERKLED_API';
  if (theConf.remotehost) {
    endpoint += ' ' + theConf.remotehost;
  }
  if (theConf.remoteipv4) {
    endpoint += ' ' + theConf.remoteipv4;
  }
  if (theConf.remoteipv6) {
    endpoint += ' ' + theConf.remoteipv6;
  }
  if (theConf.remoteport) {
    endpoint += ' ' + theConf.remoteport;
  }
  return endpoint;
}

function networkReconfiguration(conf:NetworkConfDTO, autoconf:boolean, logger:any, noupnp:boolean, done:any) {
  async.waterfall([
    upnpResolve.bind(null, noupnp, logger),
    function(upnpSuccess:boolean, upnpConf:NetworkConfDTO, next:any) {

      // Default values
      conf.port = conf.port || BMAConstants.DEFAULT_PORT;
      conf.remoteport = conf.remoteport || BMAConstants.DEFAULT_PORT;

      const localOperations = getLocalNetworkOperations(conf, autoconf);
      const remoteOpertions = getRemoteNetworkOperations(conf, upnpConf.remoteipv4);
      const dnsOperations = getHostnameOperations(conf, logger, autoconf);
      const useUPnPOperations = getUseUPnPOperations(conf, logger, autoconf);

      if (upnpSuccess) {
        _.extend(conf, upnpConf);
        const local = [conf.ipv4, conf.port].join(':');
        const remote = [conf.remoteipv4, conf.remoteport].join(':');
        if (autoconf) {
          conf.ipv6 = conf.remoteipv6 = Network.getBestLocalIPv6();
          logger.info('IPv6: %s', conf.ipv6 || "");
          logger.info('Local IPv4: %s', local);
          logger.info('Remote IPv4: %s', remote);
          // Use proposed local + remote with UPnP binding
          return async.waterfall(useUPnPOperations
            .concat(dnsOperations), next);
        }
        choose("UPnP is available: duniter will be bound: \n  from " + local + "\n  to " + remote + "\nKeep this configuration?", true,
          function () {
            // Yes: not network changes
            conf.ipv6 = conf.remoteipv6 = Network.getBestLocalIPv6();
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
              .concat(getHostnameOperations(conf, logger, autoconf))
              .concat([function (confDone:any) {
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
                .concat(getHostnameOperations(conf, logger))
                .concat([function(confDone:any) {
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


async function upnpResolve(noupnp:boolean, logger:any, done:any) {
  try {
    let conf = await Network.upnpConf(noupnp, logger);
    done(null, true, conf);
  } catch (err) {
    done(null, false, {});
  }
}

function networkConfiguration(conf:NetworkConfDTO, logger:any, done:any) {
  async.waterfall([
    upnpResolve.bind(null, !conf.upnp, logger),
    function(upnpSuccess:boolean, upnpConf:NetworkConfDTO, next:any) {

      let operations = getLocalNetworkOperations(conf)
        .concat(getRemoteNetworkOperations(conf, upnpConf.remoteipv4));

      if (upnpSuccess) {
        operations = operations.concat(getUseUPnPOperations(conf, logger));
      }

      async.waterfall(operations.concat(getHostnameOperations(conf, logger, false)), next);
    }
  ], done);
}

function getLocalNetworkOperations(conf:NetworkConfDTO, autoconf:boolean = false) {
  return [
    function (next:any){
      const osInterfaces = Network.listInterfaces();
      const interfaces = [{ name: "None", value: null }];
      osInterfaces.forEach(function(netInterface:any){
        const addresses = netInterface.addresses;
        const filtered = _(addresses).where({family: 'IPv4'});
        filtered.forEach(function(addr:any){
          interfaces.push({
            name: [netInterface.name, addr.address].join(' '),
            value: addr.address
          });
        });
      });
      if (autoconf) {
        conf.ipv4 = Network.getBestLocalIPv4();
        return next();
      }
      inquirer.prompt([{
        type: "list",
        name: "ipv4",
        message: "IPv4 interface",
        default: conf.ipv4,
        choices: interfaces
      }]).then((answers:any) => {
        conf.ipv4 = answers.ipv4;
        next();
      });
    },
    function (next:any){
      const osInterfaces = Network.listInterfaces();
      const interfaces:any = [{ name: "None", value: null }];
      osInterfaces.forEach(function(netInterface:any){
        const addresses = netInterface.addresses;
        const filtered = _(addresses).where({ family: 'IPv6' });
        filtered.forEach(function(addr:any){
          let address = addr.address
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
      interfaces.sort((addr1:any, addr2:any) => {
        if (addr1.value === null) return -1;
        if (addr1.internal && !addr2.internal) return 1;
        if (addr1.scopeid && !addr2.scopeid) return 1;
        return 0;
      });
      if (autoconf || !conf.ipv6) {
        conf.ipv6 = conf.remoteipv6 = Network.getBestLocalIPv6();
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
      }]).then((answers:any) => {
        conf.ipv6 = conf.remoteipv6 = answers.ipv6;
        next();
      });
    },
    autoconf ? (done:any) => {
        conf.port = Network.getRandomPort(conf);
        done();
      } : async.apply(simpleInteger, "Port", "port", conf)
  ];
}

function getRemoteNetworkOperations(conf:NetworkConfDTO, remoteipv4:string|null) {
  return [
    function (next:any){
      if (!conf.ipv4) {
        conf.remoteipv4 = null;
        return next(null, {});
      }
      const choices:any = [{ name: "None", value: null }];
      // Local interfaces
      const osInterfaces = Network.listInterfaces();
      osInterfaces.forEach(function(netInterface:any){
        const addresses = netInterface.addresses;
        const filtered = _(addresses).where({family: 'IPv4'});
        filtered.forEach(function(addr:any){
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
        validate: function (input:any) {
          return !!(input && input.toString().match(BMAConstants.IPV4_REGEXP));
        }
      }]).then((answers:any) => {
        if (answers.remoteipv4 == "new") {
          inquirer.prompt([{
            type: "input",
            name: "remoteipv4",
            message: "Remote IPv4",
            default: conf.remoteipv4 || conf.ipv4,
            validate: function (input:any) {
              return !!(input && input.toString().match(BMAConstants.IPV4_REGEXP));
            }
          }]).then((answers:any) => next(null, answers));
        } else {
          next(null, answers);
        }
      });
    },
    async function (answers:any, next:any){
      conf.remoteipv4 = answers.remoteipv4;
      try {
        if (conf.remoteipv4 || conf.remotehost) {
          await new Promise((resolve, reject) => {
            const getPort = async.apply(simpleInteger, "Remote port", "remoteport", conf);
            getPort((err:any) => {
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
    }
  ];
}

function getHostnameOperations(conf:NetworkConfDTO, logger:any, autoconf = false) {
  return [function(next:any) {
    if (!conf.ipv4) {
      conf.remotehost = null;
      return next();
    }
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

function getUseUPnPOperations(conf:NetworkConfDTO, logger:any, autoconf:boolean = false) {
  return [function(next:any) {
    if (!conf.ipv4) {
      conf.upnp = false;
      return next();
    }
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

function choose (question:string, defaultValue:any, ifOK:any, ifNotOK:any) {
  inquirer.prompt([{
    type: "confirm",
    name: "q",
    message: question,
    default: defaultValue
  }]).then((answer:any) => {
    answer.q ? ifOK() : ifNotOK();
  });
}

function simpleValue (question:string, property:any, defaultValue:any, conf:any, validation:any, done:any) {
  inquirer.prompt([{
    type: "input",
    name: property,
    message: question,
    default: conf[property],
    validate: validation
  }]).then((answers:any) => {
    conf[property] = answers[property];
    done();
  });
}

function simpleInteger (question:string, property:any, conf:any, done:any) {
  simpleValue(question, property, conf[property], conf, function (input:any) {
    return input && input.toString().match(/^[0-9]+$/) ? true : false;
  }, done);
}

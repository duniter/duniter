// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import {NetworkConfDTO} from "../../../lib/dto/ConfDTO"
import {Server} from "../../../../server"
import {BMAConstants} from "./constants"
import {BMALimitation} from "./limiter"
import {Underscore} from "../../../lib/common-libs/underscore"

const os = require('os');
const Q = require('q');
const ddos = require('ddos');
const http = require('http');
const express = require('express');
const morgan = require('morgan');
const errorhandler = require('errorhandler');
const bodyParser = require('body-parser');
const cors = require('cors');
const fileUpload = require('express-fileupload');

export interface NetworkInterface {
  ip:string|null
  port:number|null
}

export const Network = {

  getBestLocalIPv4,
  getBestLocalIPv6: getBestLocalIPv6,

  listInterfaces: listInterfaces,

  upnpConf,

  getRandomPort: getRandomPort,

  createServersAndListen: async (name:string, server:Server, interfaces:NetworkInterface[], httpLogs:boolean, logger:any, staticPath:string|null, routingCallback:any, listenWebSocket:any, enableFileUpload:boolean = false) => {

    const app = express();

    // all environments
    if (httpLogs) {
      app.use(morgan('\x1b[90m:remote-addr - :method :url HTTP/:http-version :status :res[content-length] - :response-time ms\x1b[0m', {
        stream: {
          write: function(message:string){
            message && logger && logger.trace(message.replace(/\n$/,''));
          }
        }
      }));
    }

    // DDOS protection
    const whitelist = interfaces.map(i => i.ip);
    if (whitelist.indexOf('127.0.0.1') === -1) {
      whitelist.push('127.0.0.1');
    }
    const ddosConf = server.conf.dos || {};
    ddosConf.silentStart = true
    ddosConf.whitelist = Underscore.uniq((ddosConf.whitelist || []).concat(whitelist));
    const ddosInstance = new ddos(ddosConf);
    app.use(ddosInstance.express);

    // CORS for **any** HTTP request
    app.use(cors());

    if (enableFileUpload) {
      // File upload for backup API
      app.use(fileUpload());
    }

    app.use(bodyParser.urlencoded({
      extended: true
    }));
    app.use(bodyParser.json({ limit: '10mb' }));

    // development only
    if (app.get('env') == 'development') {
      app.use(errorhandler());
    }

    const handleRequest = (method:any, uri:string, promiseFunc:(...args:any[])=>Promise<any>, theLimiter:any) => {
      const limiter = theLimiter || BMALimitation.limitAsUnlimited();
      method(uri, async function(req:any, res:any) {
        res.set('Access-Control-Allow-Origin', '*');
        res.type('application/json');
        try {
          if (!limiter.canAnswerNow()) {
            throw BMAConstants.ERRORS.HTTP_LIMITATION;
          }
          limiter.processRequest();
          let result = await promiseFunc(req);
          // HTTP answer
          res.status(200).send(JSON.stringify(result, null, "  "));
        } catch (e) {
          let error = getResultingError(e, logger);
          // HTTP error
          res.status(error.httpCode).send(JSON.stringify(error.uerr, null, "  "));
        }
      });
    };

    const handleFileRequest = (method:any, uri:string, promiseFunc:(...args:any[])=>Promise<any>, theLimiter:any) => {
      const limiter = theLimiter || BMALimitation.limitAsUnlimited();
      method(uri, async function(req:any, res:any) {
        res.set('Access-Control-Allow-Origin', '*');
        try {
          if (!limiter.canAnswerNow()) {
            throw BMAConstants.ERRORS.HTTP_LIMITATION;
          }
          limiter.processRequest();
          let fileStream:any = await promiseFunc(req);
          // HTTP answer
          fileStream.pipe(res);
        } catch (e) {
          let error = getResultingError(e, logger);
          // HTTP error
          res.status(error.httpCode).send(JSON.stringify(error.uerr, null, "  "));
          throw e
        }
      });
    };

    routingCallback(app, {
      httpGET:     (uri:string, promiseFunc:(...args:any[])=>Promise<any>, limiter:any) => handleRequest(app.get.bind(app), uri, promiseFunc, limiter),
      httpPOST:    (uri:string, promiseFunc:(...args:any[])=>Promise<any>, limiter:any) => handleRequest(app.post.bind(app), uri, promiseFunc, limiter),
      httpGETFile: (uri:string, promiseFunc:(...args:any[])=>Promise<any>, limiter:any) => handleFileRequest(app.get.bind(app), uri, promiseFunc, limiter)
    });

    if (staticPath) {
      app.use(express.static(staticPath));
    }

    const httpServers = interfaces.map(() => {
      const httpServer = http.createServer(app);
      const sockets:any = {};
      let nextSocketId = 0;
      httpServer.on('connection', (socket:any) => {
        const socketId = nextSocketId++;
        sockets[socketId] = socket;
        //logger && logger.debug('socket %s opened', socketId);

        socket.on('close', () => {
          //logger && logger.debug('socket %s closed', socketId);
          delete sockets[socketId];
        });
      });
      httpServer.on('error', (err:any) => {
        httpServer.errorPropagates(err);
      });
      listenWebSocket && listenWebSocket(httpServer);
      return {
        http: httpServer,
        closeSockets: () => {
          Underscore.keys(sockets).map((socketId:string) => {
            sockets[socketId].destroy();
          });
        }
      };
    });

    if (httpServers.length == 0){
      throw 'Duniter does not have any interface to listen to.';
    }

    // Return API
    return new BmaApi(name, interfaces, ddosInstance, httpServers, logger)
  }
}

export class BmaApi {

  private listenings:boolean[]

  constructor(
    private name:string,
    private interfaces:any,
    private ddosInstance:any,
    private httpServers:any,
    private logger:any
  ) {

    // May be removed when using Node 5.x where httpServer.listening boolean exists
    this.listenings = interfaces.map(() => false)
  }

  getDDOS() {
    return this.ddosInstance
  }

  async closeConnections() {
    for (let i = 0, len = this.httpServers.length; i < len; i++) {
    const httpServer = this.httpServers[i].http;
    const isListening = this.listenings[i];
    if (isListening) {
      this.listenings[i] = false;
      this.logger && this.logger.info(this.name + ' stop listening');
      await Q.Promise((resolve:any, reject:any) => {
        httpServer.errorPropagates((err:any) => {
          reject(err);
        });
        this.httpServers[i].closeSockets();
        httpServer.close((err:any) => {
          err && this.logger && this.logger.error(err.stack || err);
          resolve();
        });
      });
    }
  }
  return [];
  }

  async openConnections() {
    for (let i = 0, len = this.httpServers.length; i < len; i++) {
      const httpServer = this.httpServers[i].http;
      const isListening = this.listenings[i];
      if (!isListening) {
        const netInterface = this.interfaces[i].ip;
        const port = this.interfaces[i].port;
        try {
          await Q.Promise((resolve:any, reject:any) => {
            // Weird the need of such a hack to catch an exception...
            httpServer.errorPropagates = function(err:any) {
              reject(err);
            };
            //httpServer.on('listening', resolve.bind(this, httpServer));
            httpServer.listen(port, netInterface, (err:any) => {
              if (err) return reject(err);
              this.listenings[i] = true;
              resolve(httpServer);
            });
          });
          this.logger && this.logger.info(this.name + ' listening on http://' + (netInterface.match(/:/) ? '[' + netInterface + ']' : netInterface) + ':' + port);
        } catch (e) {
          this.logger && this.logger.warn('Could NOT listen to http://' + netInterface + ':' + port);
          this.logger && this.logger.warn(e);
        }
      }
    }
    return [];
  }
}

function getResultingError(e:any, logger:any) {
  // Default is 500 unknown error
  let error = BMAConstants.ERRORS.UNKNOWN;
  if (e) {
    // Print eventual stack trace
    typeof e == 'string' && e !== "Block already known" && logger && logger.error(e);
    e.stack && logger && logger.error(e.stack);
    e.message && logger && logger.warn(e.message);
    // BusinessException
    if (e.uerr) {
      error = e;
    } else {
      const cp = BMAConstants.ERRORS.UNHANDLED;
      error = {
        httpCode: cp.httpCode,
        uerr: {
          ucode: cp.uerr.ucode,
          message: e.message || e || error.uerr.message
        }
      };
    }
  }
  return error;
}

function getBestLocalIPv4() {
  return getBestLocal('IPv4');
}

function getBestLocalIPv6() {
  const osInterfaces = listInterfaces();
  for (let netInterface of osInterfaces) {
    const addresses = netInterface.addresses;
    const filtered = Underscore.where(addresses, {family: 'IPv6', scopeid: 0, internal: false })
    const filtered2 = Underscore.filter(filtered, (address:any) => !address.address.match(/^fe80/) && !address.address.match(/^::1/));
    if (filtered2[0]) {
      return filtered2[0].address;
    }
  }
  return null;
}

function getBestLocal(family:string) {
  let netInterfaces = os.networkInterfaces();
  let keys = Underscore.keys(netInterfaces);
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
    /^tun\d+/,
    /^enp\d+s\d+/,
    /^enp\d+s\d+f\d+/,
    /^eth\d+/,
    /^Ethernet/,
    /^wlp\d+s\d+/,
    /^wlan\d+/,
    /^Wi-Fi/,
    /^lo/,
    /^Loopback/,
    /^None/
  ];
  const best = Underscore.sortBy(res, function(entry:any) {
    for (let i = 0; i < interfacePriorityRegCatcher.length; i++) {
      // `i` is the priority (0 is the better, 1 is the second, ...)
      if (entry.name.match(interfacePriorityRegCatcher[i])) return i;
    }
    return interfacePriorityRegCatcher.length;
  })[0];
  return (best && best.value) || "";
}

function listInterfaces() {
  const netInterfaces = os.networkInterfaces();
  const keys = Underscore.keys(netInterfaces);
  const res = [];
  for (const name of keys) {
    res.push({
      name: name,
      addresses: netInterfaces[name]
    });
  }
  return res;
}

async function upnpConf (noupnp:boolean, logger:any) {
  const client = require('nat-upnp').createClient();
  // Look for 2 random ports
  const publicPort = await getAvailablePort(client)
  const privatePort = publicPort
  const conf:NetworkConfDTO = {
    proxiesConf: undefined,
    nobma: true,
    bmaWithCrawler: false,
    port: privatePort,
    ipv4: '127.0.0.1',
    ipv6: '::1',
    dos: null,
    upnp: false,
    httplogs: false,
    remoteport: publicPort,
    remotehost: null,
    remoteipv4: null,
    remoteipv6: null
  }
  logger && logger.info('Checking UPnP features...');
  if (noupnp) {
    throw Error('No UPnP');
  }
  const publicIP = await Q.nbind(client.externalIp, client)();
  await Q.nbind(client.portMapping, client)({
    public: publicPort,
    private: privatePort,
    ttl: BMAConstants.UPNP_TTL
  });
  const privateIP = await Q.Promise((resolve:any, reject:any) => {
    client.findGateway((err:any, res:any, localIP:any) => {
      if (err) return reject(err);
      resolve(localIP);
    });
  });
  conf.remoteipv4 = publicIP.match(BMAConstants.IPV4_REGEXP) ? publicIP : null;
  conf.remoteport = publicPort;
  conf.port = privatePort;
  conf.ipv4 = privateIP.match(BMAConstants.IPV4_REGEXP) ? privateIP : null;
  return conf;
}

async function getAvailablePort(client:any) {
  const mappings:{ public: { port:number }}[] = await Q.nbind(client.getMappings, client)();
  const externalPortsUsed = mappings.map(m => m.public.port)
  let availablePort = BMAConstants.BMA_PORTS_START
  while (externalPortsUsed.indexOf(availablePort) !== -1 && availablePort <= BMAConstants.BMA_PORTS_END) {
    availablePort++
  }
  if (availablePort > BMAConstants.BMA_PORTS_END) {
    throw "No port available for UPnP"
  }
  return availablePort
}

function getRandomPort(conf:NetworkConfDTO) {
  if (conf && conf.remoteport) {
    return conf.remoteport;
  } else {
    return ~~(Math.random() * (65536 - BMAConstants.PORT_START)) + BMAConstants.PORT_START;
  }
}

"use strict";
import { WS2PConstants } from './lib/constants';
import {ConfDTO, WS2PConfDTO} from "../../lib/dto/ConfDTO"
import {Server} from "../../../server"
import * as stream from 'stream';
import {WS2PCluster} from "./lib/WS2PCluster"
import {WS2PUpnp} from "./lib/ws2p-upnp"
import {CommonConstants} from "../../lib/common-libs/constants"
const constants = require("../../lib/constants");

const nuuid = require('node-uuid')

export const WS2PDependency = {
  duniter: {

    cliOptions: [
      { value: '--ws2p-upnp',                  desc: 'Use UPnP to open remote port.' },
      { value: '--ws2p-noupnp',                desc: 'Do not use UPnP to open remote port.' },
      { value: '--ws2p-host <host>',           desc: 'Host to listen to.' },
      { value: '--ws2p-port <port>',           desc: 'Port to listen to.', parser: (val:string) => parseInt(val) },
      { value: '--ws2p-remote-host <address>', desc: 'Availabily host.' },
      { value: '--ws2p-remote-port <port>',    desc: 'Availabily port.', parser: (val:string) => parseInt(val) },
      { value: '--ws2p-remote-path <path>',    desc: 'Availabily web path.' },
      { value: '--ws2p-max-private <count>',   desc: 'Maximum private connections count.', parser: (val:string) => parseInt(val) },
      { value: '--ws2p-max-public <count>',    desc: 'Maximum public connections count.', parser: (val:string) => parseInt(val) },
      { value: '--ws2p-private',               desc: 'Enable WS2P Private access.' },
      { value: '--ws2p-public',                desc: 'Enable WS2P Public access.' },
      { value: '--ws2p-noprivate',             desc: 'Disable WS2P Private access.' },
      { value: '--ws2p-nopublic',              desc: 'Disable WS2P Public access.' },
      { value: '--ws2p-prefered-add <pubkey>', desc: 'Add a prefered node to connect to through private access.' },
      { value: '--ws2p-prefered-rm  <pubkey>', desc: 'Remove prefered node.' },
      { value: '--ws2p-prefered-only  <pubkey>', desc: 'Only connect to prefered node.' },
      { value: '--ws2p-privileged-add <pubkey>', desc: 'Add a privileged node to for our public access.' },
      { value: '--ws2p-privileged-rm <pubkey>',  desc: 'Remove a privileged.' },
      { value: '--ws2p-privileged-only <pubkey>',  desc: 'Accept only connections from a privileged node.' },
    ],

    config: {

      onLoading: async (conf:WS2PConfDTO, program:any, logger:any) => {

        conf.ws2p = conf.ws2p || {
          uuid: nuuid.v4().slice(0,8),
          privateAccess: true,
          publicAccess: true,
          preferedOnly: false,
          privilegedOnly: false
        }

        // For config with missing value
        conf.ws2p.uuid = conf.ws2p.uuid || nuuid.v4().slice(0,8)
        if (conf.ws2p.privateAccess === undefined) conf.ws2p.privateAccess = true
        if (conf.ws2p.publicAccess === undefined) conf.ws2p.publicAccess = true

        if (program.ws2pHost !== undefined)       conf.ws2p.host = program.ws2pHost
        if (program.ws2pPort !== undefined)       conf.ws2p.port = parseInt(program.ws2pPort)
        if (program.ws2pRemotePort !== undefined) conf.ws2p.remoteport = program.ws2pRemotePort
        if (program.ws2pRemoteHost !== undefined) conf.ws2p.remotehost = program.ws2pRemoteHost
        if (program.ws2pRemotePath !== undefined) conf.ws2p.remotepath = program.ws2pRemotePath
        if (program.ws2pUpnp !== undefined)       conf.ws2p.upnp = true
        if (program.ws2pNoupnp !== undefined)     conf.ws2p.upnp = false
        if (program.ws2pMaxPrivate !== undefined) conf.ws2p.maxPrivate = program.ws2pMaxPrivate
        if (program.ws2pMaxPublic !== undefined)  conf.ws2p.maxPublic = program.ws2pMaxPublic
        if (program.ws2pPrivate !== undefined)    conf.ws2p.privateAccess = true
        if (program.ws2pPublic !== undefined)     conf.ws2p.publicAccess = true
        if (program.ws2pNoprivate !== undefined)  conf.ws2p.privateAccess = false
        if (program.ws2pNopublic !== undefined)   conf.ws2p.publicAccess = false

        // Prefered nodes
        if (program.ws2pPreferedAdd !== undefined) {
          conf.ws2p.preferedNodes = conf.ws2p.preferedNodes || []
          conf.ws2p.preferedNodes.push(String(program.ws2pPreferedAdd))
        }
        if (program.ws2pPreferedRm !== undefined) {
          conf.ws2p.preferedNodes = conf.ws2p.preferedNodes || []
          const index = conf.ws2p.preferedNodes.indexOf(program.ws2pPreferedRm)
          if (index !== -1) {
            conf.ws2p.preferedNodes.splice(index, 1)
          }
        }
        if (program.ws2pPreferedOnly !== undefined) conf.ws2p.preferedOnly = true

        // Privileged nodes
        if (program.ws2pPrivilegedAdd !== undefined) {
          conf.ws2p.privilegedNodes = conf.ws2p.privilegedNodes || []
          conf.ws2p.privilegedNodes.push(String(program.ws2pPrivilegedAdd))
        }
        if (program.ws2pPrivilegedRm !== undefined) {
          conf.ws2p.privilegedNodes = conf.ws2p.privilegedNodes || []
          const index = conf.ws2p.privilegedNodes.indexOf(program.ws2pPrivilegedRm)
          if (index !== -1) {
            conf.ws2p.privilegedNodes.splice(index, 1)
          }
        }
        if (program.ws2pPrivilegedOnly !== undefined) conf.ws2p.privilegedOnly = true

        // Default value
        if (conf.ws2p.upnp === undefined || conf.ws2p.upnp === null) {
          conf.ws2p.upnp = true; // Defaults to true
        }
      },

      beforeSave: async (conf:WS2PConfDTO) => {
        if (conf.ws2p && !conf.ws2p.host) delete conf.ws2p.host
        if (conf.ws2p && !conf.ws2p.port) delete conf.ws2p.port
        if (conf.ws2p && !conf.ws2p.remoteport) delete conf.ws2p.remoteport
        if (conf.ws2p && !conf.ws2p.remotehost) delete conf.ws2p.remotehost
      }
    },

    service: {
      input: (server:Server, conf:WS2PConfDTO, logger:any) => {
        const api = new WS2PAPI(server, conf, logger)
        server.ws2pCluster = api.getCluster()
        server.addEndpointsDefinitions(async () => api.getEndpoint())
        server.addWrongEndpointFilter((endpoints:string[]) => getWrongEndpoints(endpoints, conf))
        return api
      }
    },

    cli: [{
      name: 'ws2p [list-prefered|list-privileged|list-nodes|show-conf]',
      desc: 'WS2P operations for configuration and diagnosis tasks.',
      logs: false,

      onConfiguredExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
        const subcmd = params[0];
        if (subcmd === 'list-nodes') {
          // Needs the DAL plugged
          await server.initDAL();
        }
        switch (subcmd) {
          case 'show-conf':
            console.log(JSON.stringify(conf.ws2p, null, ' '))
            break;
          case 'list-prefered':
            for (const p of (conf.ws2p && conf.ws2p.preferedNodes || [])) {
              console.log(p)
            }
            break;
          case 'list-privileged':
            for (const p of (conf.ws2p && conf.ws2p.privilegedNodes || [])) {
              console.log(p)
            }
            break;
          case 'list-nodes':
            const peers = await server.dal.getWS2Peers()
            for (const p of peers) {
              for (const ep of p.endpoints) {
                if (ep.match(/^WS2P/)) {
                  console.log(p.pubkey, ep)
                }
              }
            }
            break;
          default:
            throw constants.ERRORS.CLI_CALLERR_WS2P;
        }
      }
    }]
  }
}

async function getWrongEndpoints(endpoints:string[], ws2pConf:WS2PConfDTO) {
  return endpoints.filter(ep => {
    const match = ep.match(CommonConstants.WS2P_REGEXP)
    return ws2pConf.ws2p && match && match[1] === ws2pConf.ws2p.uuid
  })
}

export class WS2PAPI extends stream.Transform {

  // Public http interface
  private cluster:WS2PCluster
  private upnpAPI:WS2PUpnp|null

  constructor(
    private server:Server,
    private conf:WS2PConfDTO,
    private logger:any) {
    super({ objectMode: true })
    this.cluster = WS2PCluster.plugOn(server)
  }

  getCluster() {
    return this.cluster
  }

  startService = async () => {

    /***************
     * PUBLIC ACCESS
     **************/

    if (this.conf.ws2p && this.conf.ws2p.publicAccess) {

      /***************
       *   MANUAL
       **************/
      if (this.conf.ws2p
        && !this.conf.ws2p.upnp
        && this.conf.ws2p.host
        && this.conf.ws2p.port) {
        await this.cluster.listen(this.conf.ws2p.host, this.conf.ws2p.port)
      }

      /***************
       *    UPnP
       **************/
      else if (!this.conf.ws2p || this.conf.ws2p.upnp !== false) {
        if (this.upnpAPI) {
          this.upnpAPI.stopRegular();
        }
        try {
          this.upnpAPI = new WS2PUpnp(this.logger)
          const { host, port, available } = await this.upnpAPI.startRegular()
          if (available) {
            // Defaults UPnP to true if not defined and available
            this.conf.ws2p.upnp = true
            await this.cluster.listen(host, port)
            await this.server.PeeringService.generateSelfPeer(this.server.conf)
          }
        } catch (e) {
          this.logger.warn(e);
        }
      }
    }

    /***************
     * PRIVATE ACCESS
     **************/

    if (!this.conf.ws2p || this.conf.ws2p.privateAccess) {
      await this.cluster.startCrawling()
    }
  }

  stopService = async () => {
    if (this.cluster) {
      await this.cluster.stopCrawling()
      await this.cluster.close()
    }
    if (this.upnpAPI) {
      this.upnpAPI.stopRegular();
    }
  }

  async getEndpoint() {
    // If WS2P defined and enabled
    if (this.server.conf.ws2p !== undefined && (this.server.conf.ws2p.publicAccess || this.server.conf.ws2p.privateAccess))
    {
      let endpointType = "WS2P"
      if (this.server.conf.upnp && this.upnpAPI) {
        const config = this.upnpAPI.getCurrentConfig()
        if (config) {
          if (config.remotehost.match(WS2PConstants.HOST_ONION_REGEX)) { endpointType += "TOR"; }
          return [endpointType, this.server.conf.ws2p.uuid, config.remotehost, config.port].join(' ')
        } else {
          return ''
        }
      }
      else if (this.server.conf.ws2p.uuid
        && this.server.conf.ws2p.remotehost
        && this.server.conf.ws2p.remoteport) {
          if (this.server.conf.ws2p.remotehost.match(WS2PConstants.HOST_ONION_REGEX)) { endpointType += "TOR"; }
          let ep = [endpointType,
            this.server.conf.ws2p.uuid,
            this.server.conf.ws2p.remotehost,
            this.server.conf.ws2p.remoteport
          ].join(' ')
          if (this.server.conf.ws2p.remotepath) {
            ep += ` ${this.server.conf.ws2p.remotepath}`
          }
          return ep
      }
    }
    return ''
  }
}
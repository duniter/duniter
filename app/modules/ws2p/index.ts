"use strict";
import {WS2PConfDTO} from "../../lib/dto/ConfDTO"
import {Server} from "../../../server"
import * as stream from "stream"
import {WS2PCluster} from "./lib/WS2PCluster"
import {WS2PUpnp} from "./lib/ws2p-upnp"

export const WS2PDependency = {
  duniter: {

    cliOptions: [
      { value: '--ws2p-upnp',                  desc: 'Use UPnP to open remote port.' },
      { value: '--ws2p-noupnp',                desc: 'Do not use UPnP to open remote port.' },
      { value: '--ws2p-port <port>',           desc: 'Host to listen to' },
      { value: '--ws2p-host <host>',           desc: 'Port to listen to', parser: (val:string) => parseInt(val) },
      { value: '--ws2p-remote-host <address>', desc: 'Availabily host' },
      { value: '--ws2p-remote-port <port>',    desc: 'Availabily port', parser: (val:string) => parseInt(val) },
    ],

    config: {

      onLoading: async (conf:WS2PConfDTO, program:any, logger:any) => {

        conf.ws2p = conf.ws2p || {}

        if (program.ws2pHost !== undefined)       conf.ws2p.host = program.ws2pHost
        if (program.ws2pPort !== undefined)       conf.ws2p.port = parseInt(program.ws2pPort)
        if (program.ws2pRemotePort !== undefined) conf.ws2p.remoteport = program.ws2pRemotePort
        if (program.ws2pRemoteHost !== undefined) conf.ws2p.remotehost = program.ws2pRemoteHost
        if (program.ws2pUpnp !== undefined)       conf.ws2p.upnp = true
        if (program.ws2pNoupnp !== undefined)     conf.ws2p.upnp = false

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
        server.addEndpointsDefinitions(() => api.getEndpoint())
        return api
      }
    }
  }
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
    this.cluster = new WS2PCluster(server)
  }

  startService = async () => {

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
        this.upnpAPI = await new WS2PUpnp(this.logger)
        const { host, port } = await this.upnpAPI.startRegular()
        await this.cluster.listen(host, port)
        await this.server.PeeringService.generateSelfPeer(this.server.conf)
      } catch (e) {
        this.logger.warn(e);
      }
    }
  }

  stopService = async () => {
    if (this.cluster) {
      await this.cluster.close()
    }
    if (this.upnpAPI) {
      this.upnpAPI.stopRegular();
    }
  }

  async getEndpoint() {
    return this.upnpAPI ? this.upnpAPI.getRemoteEndpoint() : ''
  }
}
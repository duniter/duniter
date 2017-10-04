import {CommonConstants} from "../common-libs/constants"
const _ = require('underscore');
const constants = require('../constants');

export interface Keypair {
  pub: string
  sec: string
}

export interface BranchingDTO {
  switchOnHeadAdvance:number
  avgGenTime:number
  forksize:number
}

export interface CurrencyConfDTO {
  currency: string
  c: number
  dt: number
  ud0: number
  sigPeriod: number
  sigStock: number
  sigWindow: number
  sigValidity: number
  sigQty: number
  idtyWindow: number
  msWindow: number
  msPeriod: number
  xpercent: number
  msValidity: number
  stepMax: number
  medianTimeBlocks: number
  avgGenTime: number
  dtDiffEval: number
  percentRot: number
  udTime0: number
  udReevalTime0: number
  dtReeval: number
}

export interface KeypairConfDTO {
  pair: Keypair
  oldPair: Keypair|null
  salt: string
  passwd: string
}

export interface NetworkConfDTO {
  nobma: boolean
  remoteport: number
  remotehost: string|null
  remoteipv4: string|null
  remoteipv6: string|null
  port: number
  ipv4: string
  ipv6: string
  dos:any
  upnp:boolean
  httplogs:boolean
}

export interface WS2PConfDTO {
  ws2p?: {
    privateAccess: boolean
    publicAccess: boolean
    uuid: string
    upnp?: boolean
    remotehost?: string|null
    remoteport?: number|null
    remotepath?: string
    port?: number
    host?: string
    maxPublic?:number
    maxPrivate?:number
    preferedNodes?: string[]
    privilegedNodes?: string[]
  }
}

export class ConfDTO implements CurrencyConfDTO, KeypairConfDTO, NetworkConfDTO, BranchingDTO, WS2PConfDTO {

  constructor(
    public loglevel: string,
    public currency: string,
    public endpoints: string[],
    public rmEndpoints: string[],
    public rootoffset: number,
    public upInterval: number,
    public cpu: number,
    public nbCores: number,
    public prefix: number,
    public powSecurityRetryDelay: number,
    public powMaxHandicap: number,
    public c: number,
    public dt: number,
    public dtReeval: number,
    public dtDiffEval: number,
    public ud0: number,
    public udTime0: number,
    public udReevalTime0: number,
    public stepMax: number,
    public sigPeriod: number,
    public msPeriod: number,
    public sigValidity: number,
    public msValidity: number,
    public sigQty: number,
    public sigStock: number,
    public xpercent: number,
    public percentRot: number,
    public powDelay: number,
    public avgGenTime: number,
    public medianTimeBlocks: number,
    public httplogs: boolean,
    public timeout: number,
    public isolate: boolean,
    public forksize: number,
    public idtyWindow: number,
    public msWindow: number,
    public sigWindow: number,
    public switchOnHeadAdvance: number,
    public pair: Keypair,
    public oldPair: Keypair|null,
    public salt: string,
    public passwd: string,
    public remoteport: number,
    public remotehost: string|null,
    public remoteipv4: string|null,
    public remoteipv6: string|null,
    public port: number,
    public ipv4: string,
    public ipv6: string,
    public dos: any,
    public upnp: boolean,
    public homename: string,
    public memory: boolean,
    public nobma: boolean,
    public ws2p?: {
      privateAccess: boolean
      publicAccess: boolean
      uuid: string
      upnp?: boolean
      remotehost?: string|null
      remoteport?: number|null
      remotepath?: string
      port?: number
      host?: string
      preferedNodes?: string[]
      privilegedNodes?: string[]
      maxPublic?:number
      maxPrivate?:number
    }
) {}

  static mock() {
    return new ConfDTO("", "", [], [], 0, 0, 0.6, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, false, 0, false, 0, 0, 0, 0, 0, { pub:'', sec:'' }, null, "", "", 0, "", "", "", 0, "", "", null, false, "", true, true)
  }

  static defaultConf() {
    return {
      "currency": null,
      "endpoints": [],
      "rmEndpoints": [],
      "upInterval": 3600 * 1000,
      "c": constants.CONTRACT.DEFAULT.C,
      "dt": constants.CONTRACT.DEFAULT.DT,
      "dtReeval": constants.CONTRACT.DEFAULT.DT_REEVAL,
      "ud0": constants.CONTRACT.DEFAULT.UD0,
      "stepMax": constants.CONTRACT.DEFAULT.STEPMAX,
      "sigPeriod": constants.CONTRACT.DEFAULT.SIGPERIOD,
      "sigValidity": constants.CONTRACT.DEFAULT.SIGVALIDITY,
      "msValidity": constants.CONTRACT.DEFAULT.MSVALIDITY,
      "sigQty": constants.CONTRACT.DEFAULT.SIGQTY,
      "xpercent": constants.CONTRACT.DEFAULT.X_PERCENT,
      "percentRot": constants.CONTRACT.DEFAULT.PERCENTROT,
      "powDelay": constants.CONTRACT.DEFAULT.POWDELAY,
      "avgGenTime": constants.CONTRACT.DEFAULT.AVGGENTIME,
      "dtDiffEval": constants.CONTRACT.DEFAULT.DTDIFFEVAL,
      "medianTimeBlocks": constants.CONTRACT.DEFAULT.MEDIANTIMEBLOCKS,
      "httplogs": false,
      "udid2": false,
      "timeout": 3000,
      "isolate": false,
      "forksize": constants.BRANCHES.DEFAULT_WINDOW_SIZE,
      "switchOnHeadAdvance": CommonConstants.SWITCH_ON_BRANCH_AHEAD_BY_X_BLOCKS
    };
  }

  static complete(conf:any) {
    return _(ConfDTO.defaultConf()).extend(conf);
  }
}
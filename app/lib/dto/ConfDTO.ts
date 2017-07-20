const _ = require('underscore');
const constants = require('../constants');

export interface Keypair {
  pub: string
  sec: string
}

export interface CurrencyConfDTO {
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

export class ConfDTO implements CurrencyConfDTO, KeypairConfDTO, NetworkConfDTO {

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
    public swichOnTimeAheadBy: number,
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
) {}

  static mock() {
    return new ConfDTO("", "", [], [], 0, 0, 0.6, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, false, 0, false, 0, 0, 0, 0, 0, { pub:'', sec:'' }, null, "", "", 0, "", "", "", 0, "", "", null, false, "", true)
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
      "forksize": constants.BRANCHES.DEFAULT_WINDOW_SIZE
    };
  }

  static complete(conf:any) {
    return _(ConfDTO.defaultConf()).extend(conf);
  }
}
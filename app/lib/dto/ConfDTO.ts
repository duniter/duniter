export interface Keypair {
  pub: string
  sec: string
}

export class ConfDTO {

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
    public remoteport: number,
    public remotehost: string,
    public remoteipv4: string,
    public remoteipv6: string,
    public port: number,
    public ipv4: string,
    public ipv6: string,
    public homename: string,
    public memory: boolean,
) {}

  static mock() {
    return new ConfDTO("", "", [], [], 0, 0, 0.6, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, false, 0, false, 0, 0, 0, 0, 0, { pub:'', sec:'' }, 0, "", "", "", 0, "", "", "", true)
  }
}
"use strict";

const A_MINUTE = 60 * 1000;
const A_SECOND = 1000;

export class Limiter {

  private limitPerSecond:number
  private limitPerMinute:number

  // Stock of request times
  private reqsSec:number[] = []
  
  // The length of reqs.
  // It is better to have it instead of calling reqs.length
  private reqsSecLen:number

  // Minute specific
  private reqsMin:number[] = []
  private reqsMinLen:number

  constructor(strategy: { limitPerSecond:number, limitPerMinute:number }) {
    this.limitPerSecond = strategy.limitPerSecond
    this.limitPerMinute = strategy.limitPerMinute
  }

  /**
   * Tells wether the quota is reached at current time or not.
   */
  canAnswerNow() {
    // Rapid decision first.
    // Note: we suppose limitPerSecond < limitPerMinute
    if (this.reqsSecLen < this.limitPerSecond && this.reqsMinLen < this.limitPerMinute) {
      return true;
    }
    this.updateRequests();
    return this.reqsSecLen < this.limitPerSecond && this.reqsMinLen < this.limitPerMinute;
  }

  /**
   * Filter the current requests stock to remove the too old ones
   */
  updateRequests() {
    // Clean current requests stock and make the test again
    const now = Date.now();
    let i = 0, reqs = this.reqsMin, len = this.reqsMinLen;
    // Reinit specific indicators
    this.reqsSec = [];
    this.reqsMin = [];
    while (i < len) {
      const duration = now - reqs[i];
      if (duration < A_SECOND) {
        this.reqsSec.push(reqs[i]);
      }
      if (duration < A_MINUTE) {
        this.reqsMin.push(reqs[i]);
      }
      i++;
    }
    this.reqsSecLen = this.reqsSec.length;
    this.reqsMinLen = this.reqsMin.length;
  }
  
  processRequest() {
    const now = Date.now();
    this.reqsSec.push(now);
    this.reqsSecLen++;
    this.reqsMin.push(now);
    this.reqsMinLen++;
  }
}

let LOW_USAGE_STRATEGY = {
  limitPerSecond: 1,
  limitPerMinute: 30
}

let HIGH_USAGE_STRATEGY = {
  limitPerSecond: 10,
  limitPerMinute: 300
}

let VERY_HIGH_USAGE_STRATEGY = {
  limitPerSecond: 30,
  limitPerMinute: 30 * 60 // Limit is only per secon
}

let TEST_STRATEGY = {
  limitPerSecond: 5,
  limitPerMinute: 6
}

let NO_LIMIT_STRATEGY = {
  limitPerSecond: 1000000,
  limitPerMinute: 1000000 * 60
}

let disableLimits = false;

export const BMALimitation = {
  
  limitAsLowUsage() {
    return disableLimits ? new Limiter(NO_LIMIT_STRATEGY) : new Limiter(LOW_USAGE_STRATEGY);
  },

  limitAsHighUsage() {
    return disableLimits ? new Limiter(NO_LIMIT_STRATEGY) : new Limiter(HIGH_USAGE_STRATEGY);
  },

  limitAsVeryHighUsage() {
    return disableLimits ? new Limiter(NO_LIMIT_STRATEGY) : new Limiter(VERY_HIGH_USAGE_STRATEGY);
  },

  limitAsUnlimited() {
    return new Limiter(NO_LIMIT_STRATEGY);
  },

  limitAsTest() {
    return disableLimits ? new Limiter(NO_LIMIT_STRATEGY) : new Limiter(TEST_STRATEGY);
  },

  noLimit() {
    disableLimits = true;
  },

  withLimit() {
    disableLimits = false;
  }
};

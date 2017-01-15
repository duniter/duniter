"use strict";

const A_MINUTE = 60 * 1000;
const A_SECOND = 1000;

const Limiter = {

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
  },

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
  },
  
  processRequest() {
    const now = Date.now();
    this.reqsSec.push(now);
    this.reqsSecLen++;
    this.reqsMin.push(now);
    this.reqsMinLen++;
  }
};

let HIGH_USAGE_STRATEGY = Object.create(Limiter);
HIGH_USAGE_STRATEGY.limitPerSecond = 10;
HIGH_USAGE_STRATEGY.limitPerMinute = 300;

let VERY_HIGH_USAGE_STRATEGY = Object.create(Limiter);
VERY_HIGH_USAGE_STRATEGY.limitPerSecond = 30;
VERY_HIGH_USAGE_STRATEGY.limitPerMinute = 30 * 60; // Limit is only per second

let TEST_STRATEGY = Object.create(Limiter);
TEST_STRATEGY.limitPerSecond = 5;
TEST_STRATEGY.limitPerMinute = 6;

let NO_LIMIT_STRATEGY = Object.create(Limiter);
NO_LIMIT_STRATEGY.limitPerSecond = 1000000;
NO_LIMIT_STRATEGY.limitPerMinute = 1000000 * 60;

let disableLimits = false;

module.exports = {
  
  limitAsHighUsage() {
    return disableLimits ? createObject(NO_LIMIT_STRATEGY) : createObject(HIGH_USAGE_STRATEGY);
  },

  limitAsVeryHighUsage() {
    return disableLimits ? createObject(NO_LIMIT_STRATEGY) : createObject(VERY_HIGH_USAGE_STRATEGY);
  },

  limitAsUnlimited() {
    return createObject(NO_LIMIT_STRATEGY);
  },

  limitAsTest() {
    return disableLimits ? createObject(NO_LIMIT_STRATEGY) : createObject(TEST_STRATEGY);
  },

  noLimit() {
    disableLimits = true;
  },

  withLimit() {
    disableLimits = false;
  }
};

function createObject(strategy) {

  const obj = Object.create(strategy);

  // Stock of request times
  obj.reqsSec = [];

    // The length of reqs.
    // It is better to have it instead of calling reqs.length
  obj.reqsSecLen = 0;

    // Minute specific
  obj.reqsMin = [];
  obj.reqsMinLen = 0;
  return obj;
}

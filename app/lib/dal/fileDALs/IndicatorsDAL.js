/**
 * Created by cgeek on 22/08/15.
 */

const co = require('co');

module.exports = IndicatorsDAL;

function IndicatorsDAL(rootPath, qioFS, parentCore, localDAL, AbstractStorage) {

  "use strict";

  const that = this;

  AbstractStorage.call(this, rootPath, qioFS, parentCore, localDAL);

  this.init = () => {
    return co(function *() {
      yield [
        that.coreFS.makeTree('indicators/'),
        that.coreFS.makeTree('indicators/issuers')
      ];
    });
  };

  const cache = {};

  function setBlock(key, block) {
    cache[key] = block;
    return Promise.resolve(block);
  }

  function getBlock(key) {
    return Promise.resolve(cache[key] || null);
  }

  this.writeCurrentExcluding = (excluding) => setBlock('excludingMS', excluding);

  this.writeCurrentRevocating = (revocating) => setBlock('revocatingMS', revocating);

  this.writeCurrentExcludingForCert = (excluding) => setBlock('excludingCRT', excluding);

  this.writeCurrentExpiringForCert = (excluding) => setBlock('expiringCRT', excluding);

  this.writeCurrentExpiringForIdty = (excluding) => setBlock('expiringIDTY', excluding);

  this.writeCurrentExpiringForMembership = (excluding) => setBlock('expiringMS', excluding);

  this.getCurrentMembershipExcludingBlock = () => getBlock('excludingMS');

  this.getCurrentMembershipRevocatingBlock = () => getBlock('revocatingMS');

  this.getCurrentCertificationExpiringBlock = () => getBlock('expiringCRT');

  this.getCurrentCertificationExcludingBlock = () => getBlock('excludingCRT');

  this.getCurrentIdentityExpiringBlock = () => getBlock('expiringIDTY');

  this.getCurrentMembershipExpiringBlock = () => getBlock('expiringMS');
}

/**
 * Created by cgeek on 22/08/15.
 */

var AbstractCFS = require('./AbstractCFS');
var AbstractCacheable = require('./AbstractCacheable');
var co = require('co');

module.exports = MembershipDAL;

function MembershipDAL(rootPath, qioFS, parentCore, localDAL, rootDAL, considerCacheInvalidateByDefault) {

  "use strict";

  var that = this;

  // CFS facilities
  AbstractCFS.call(this, rootPath, qioFS, parentCore, localDAL);

  this.cachedLists = {
    'membershipsOfIssuer': ['getMembershipsOfIssuer']
  };

  this.init = () => {
    return co(function *() {
      yield [
        that.coreFS.makeTree('ms/'),
        that.coreFS.makeTree('ms/written/'),
        that.coreFS.makeTree('ms/pending/'),
        that.coreFS.makeTree('ms/pending/in/'),
        that.coreFS.makeTree('ms/pending/out/')
      ];
    });
  };

  this.getMembershipOfIssuer = (ms) => {
    return co(function *() {
      try {
        return that.coreFS.readJSON('ms/written/' + ms.issuer + '/' + ms.membership.toLowerCase() + '/' + getMSID(ms) + '.json');
      } catch (e) {
        return that.coreFS.readJSON('ms/pending/' + ms.membership.toLowerCase() + '/' + getMSID(ms) + '.json');
      }
    });
  };

  this.getMembershipsOfIssuer = (issuer) => {
    return co(function *() {
      var mssIN = yield that.coreFS.listJSON('ms/written/' + issuer + '/in/');
      var mssOUT = yield that.coreFS.listJSON('ms/written/' + issuer + '/out/');
      return mssIN.concat(mssOUT);
    });
  };

  this.getPendingLocal = () => {
    return co(function *() {
      var mssIN = yield that.coreFS.listJSONLocal('ms/pending/in/');
      var mssOUT = yield that.coreFS.listJSONLocal('ms/pending/out/');
      return mssIN.concat(mssOUT);
    });
  };

  this.getPendingIN = () => that.coreFS.listJSON('ms/pending/in/');
  this.getPendingOUT = () => that.coreFS.listJSON('ms/pending/out/');

  this.saveOfficialMS = (type, ms) => {
    return co(function *() {
      yield that.coreFS.makeTree('ms/written/' + ms.issuer + '/' + type);
      yield that.coreFS.writeJSON('ms/written/' + ms.issuer + '/' + type + '/' + getMSID(ms) + '.json', ms);
      yield that.coreFS.remove('ms/pending/' + type + '/' + getMSID(ms) + '.json').catch(() => null);
      if (that.dal.name != 'fileDal') {
        that.invalidateCache('membershipsOfIssuer', ms.issuer);
      }
    });
  };

  this.savePendingMembership = (ms) => {
    if (that.dal.name != 'fileDal') {
      that.invalidateCache('membershipsOfIssuer', ms.issuer);
    }
    return that.coreFS.writeJSON('ms/pending/' + ms.membership.toLowerCase() + '/' + getMSID(ms) + '.json', ms);
  };

  function getMSID(ms) {
    return [ms.membership, ms.issuer, ms.number, ms.hash].join('-');
  }

  // Cache facilities
  AbstractCacheable.call(this, 'msDAL', rootDAL, considerCacheInvalidateByDefault);
}
/**
 * Created by cgeek on 22/08/15.
 */

var co = require('co');
var Source = require('../../entity/source');

module.exports = DividendDAL;

function DividendDAL(rootPath, qioFS, parentCore, localDAL, AbstractStorage) {

  "use strict";

  AbstractStorage.call(this, rootPath, qioFS, parentCore, localDAL);

  let that = this;

  this.init = () => this.coreFS.makeTree('/ud_history');

  this.saveUDInHistory = (pubkey, ud) => co(function *() {
    let obj = yield that.coreFS.readJSON('/ud_history/' + pubkey + '.json')
      .then((res) => res || { history: [] })
      .catch(() => { return { history: [] }; });
    obj.history.push(new Source(ud).UDjson());
    return that.coreFS.writeJSON('/ud_history/' + pubkey + '.json');
  });

  this.getUDHistory = (pubkey) => this.coreFS.readJSON('/ud_history/' + pubkey + '.json').catch(() => { return { history: [] }; });
}

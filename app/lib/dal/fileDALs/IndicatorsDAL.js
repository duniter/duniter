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


}

/**
 * Created by cgeek on 22/08/15.
 */

var cfs = require('../../cfs');

module.exports = PeerDAL;

function PeerDAL(rootPath, qioFS, parentCore) {

  "use strict";

  this.coreFS = cfs(rootPath, qioFS, parentCore);

  this.changeParentCore = (newParent) => this.coreFS.changeParent(newParent);

  this.init = () => this.coreFS.makeTree('peers/');

  this.listAll = () => this.coreFS.listJSON('peers/');

  this.getPeer = (pubkey) => this.coreFS.readJSON('peers/' + pubkey + '.json');

  this.savePeer = (peer) => this.coreFS.writeJSON('peers/' + peer.pubkey + '.json', peer);
}

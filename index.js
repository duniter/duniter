
var HDCServer      = require('./hdcserver');
var PeerServer     = require('./peerserver');
var RegistryServer = require('./regserver');

module.exports = {
  createHDCServer: function (dbConf, overConf) {
    return new HDCServer(dbConf, overConf);
  },
  createPeerServer: function (dbConf, overConf) {
    return new PeerServer(dbConf, overConf);
  },
  createRegistryServer: function (dbConf, overConf) {
    return new RegistryServer(dbConf, overConf);
  }
}

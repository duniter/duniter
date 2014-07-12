
var Server         = require('./server');
var PKSServer      = require('./pksserver');
var HDCServer      = require('./hdcserver');
var PeerServer     = require('./peerserver');
var RegistryServer = require('./regserver');

module.exports = {
  connect: function (dbConf, overConf) {
    return new Server(dbConf, overConf);
  },
  createPKSServer: function (dbConf, overConf) {
    return new PKSServer(dbConf, overConf);
  },
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

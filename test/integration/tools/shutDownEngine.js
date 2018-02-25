const co = require('co')

module.exports = (server) => co(function*() {
  if (server._utProver) {
    const farm = yield server._utProver.getWorker();
    return farm.shutDownEngine();
  }
})

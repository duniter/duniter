const addon = require('../native/index.node');

const { Wot } = addon;

class WotBuilder {

    static fromWot(wot) {
        return new Wot(wot.toBytes());
    }

    static fromFile(filePath) {
        return new Wot(filePath)
    }
}

module.exports = { Wot, WotBuilder };

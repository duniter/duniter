"use strict";
const _ = require('underscore');
const should = require('should');
const fs = require('fs');
const co = require('co');
const unzip = require('unzip');
const toolbox = require('../integration/tools/toolbox');
const TestUser = require('../integration/tools/TestUser').TestUser
const bma     = require('../../app/modules/bma').BmaDependency.duniter.methods.bma;

const serverConfig = {
  memory: false,
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
};

let s0, s1;

describe('Import/Export', () => {

  before(() => co(function *() {
    s0 = toolbox.server(_.extend({ homename: 'dev_unit_tests1', powNoSecurity: true }, serverConfig));
    yield s0.resetHome();

    s1 = toolbox.server(_.extend({ homename: 'dev_unit_tests1', powNoSecurity: true }, serverConfig));

    const cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    const tac = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });

    yield s1.initDalBmaConnections();
    yield cat.createIdentity();
    yield tac.createIdentity();
    yield cat.cert(tac);
    yield tac.cert(cat);
    yield cat.join();
    yield tac.join();
    yield s1.commit();
  }));

  after(() => {
    return Promise.all([
      s0.closeCluster(),
      s1.closeCluster()
    ])
  })

  it('should be able to export data', () => co(function *() {
    const archive = yield s1.exportAllDataAsZIP();
    const output = require('fs').createWriteStream(s1.home + '/export.zip');
    archive.pipe(output);
    return new Promise((resolve, reject) => {
      archive.on('error', reject);
      output.on('close', function() {
        resolve();
      });
    });
  }));

  it('should be able to import data', () => co(function *() {
    yield s1.unplugFileSystem();
    yield s1.importAllDataFromZIP(s1.home + '/export.zip');
  }));
});

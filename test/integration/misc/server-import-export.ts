// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import {TestUser} from "../tools/TestUser"
import {NewTestingServer, TestingServer} from "../tools/toolbox"
import {Underscore} from "../../../app/lib/common-libs/underscore"

const should = require('should');

const serverConfig = {
  memory: false,
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
};

let s0:TestingServer, s1:TestingServer

describe('Import/Export', () => {

  before(async () => {
    s0 = NewTestingServer(Underscore.extend({ homename: 'dev_unit_tests1', powNoSecurity: true }, serverConfig));
    await s0.resetHome();

    s1 = NewTestingServer(Underscore.extend({ homename: 'dev_unit_tests1', powNoSecurity: true }, serverConfig));

    const cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    const tac = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });

    await s1.initDalBmaConnections();
    await cat.createIdentity();
    await tac.createIdentity();
    await cat.cert(tac);
    await tac.cert(cat);
    await cat.join();
    await tac.join();
    await s1.commit();
  })

  after(() => {
    return Promise.all([
      s0.closeCluster(),
      s1.closeCluster()
    ])
  })

  it('should be able to export data', async () => {
    const archive = await s1.exportAllDataAsZIP();
    const output = require('fs').createWriteStream(s1.home + '/export.zip');
    archive.pipe(output);
    return new Promise((resolve, reject) => {
      archive.on('error', reject);
      output.on('close', function() {
        resolve();
      });
    });
  })

  it('should be able to import data', async () => {
    await s1.unplugFileSystem();
    await s1.importAllDataFromZIP(s1.home + '/export.zip');
  })
})

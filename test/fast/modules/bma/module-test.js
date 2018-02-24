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

"use strict";
const assert = require('assert');
const should = require('should');
const co  = require('co');
const duniterBMA = require('../../../../app/modules/bma/index').BmaDependency
const duniterKeypair = require('../../../../app/modules/keypair').KeypairDependency
const network = require('../../../../app/modules/bma/lib/network').Network
const duniter = require('../../../../index')
const logger = require('../../../../app/lib/logger').NewLogger()
const rp = require('request-promise');

const stack = duniter.statics.minimalStack();
stack.registerDependency(duniterKeypair, 'duniter-keypair');
stack.registerDependency(duniterBMA,     'duniter-bma');

describe('Module usage', () => {

  it('/node/summary should answer', () => co(function*() {
    stack.registerDependency({
      duniter: {
        cli: [{
          name: 'test1',
          desc: 'Unit Test execution',
          onDatabaseExecute: (server, conf, program, params, startServices) => co(function*() {
            yield startServices();
          })
        }]
      }
    }, 'duniter-automated-test');
    yield stack.executeStack(['node', 'index.js', 'test1',
      '--memory',
      '--noupnp',
      '--ipv4', '127.0.0.1',
      '--port', '10400'
    ]);
    const json = yield rp.get({
      url: 'http://127.0.0.1:10400/node/summary',
      json: true,
      timeout: 1000
    });
    should.exist(json);
    json.should.have.property('duniter').property('software').equal('duniter');
  }));

  it('remoteipv4 should NOT be filled if remote Host is declared', () => co(function*() {
    stack.registerDependency({
      duniter: {
        cli: [{
          name: 'test2',
          desc: 'Unit Test execution',
          onConfiguredExecute: (server, conf, program, params, startServices) => co(function*() {
            conf.should.not.have.property('remoteipv4');
            conf.should.have.property('remoteipv6').equal(undefined);
            conf.should.have.property('remotehost').equal('localhost');
          })
        }]
      }
    }, 'duniter-automated-test');
    yield stack.executeStack(['node', 'index.js', 'test2',
      '--memory',
      '--ipv4',    '127.0.0.1',
      '--remoteh', 'localhost',
      '--port',    '10400'
    ]);
  }));

  it('remoteipv4 should NOT be filled if remote IPv6 is declared', () => co(function*() {
    stack.registerDependency({
      duniter: {
        cli: [{
          name: 'test3',
          desc: 'Unit Test execution',
          onConfiguredExecute: (server, conf, program, params, startServices) => co(function*() {
            conf.should.not.have.property('remoteipv4');
            conf.should.not.have.property('remotehost');
            conf.should.have.property('remoteipv6').equal('::1');
          })
        }]
      }
    }, 'duniter-automated-test');
    yield stack.executeStack(['node', 'index.js', 'test3',
      '--memory',
      '--ipv4',    '127.0.0.1',
      '--ipv6', '::1',
      '--port', '10400'
    ]);
  }));

  it('remoteipv4 should be NOT be auto-filled if manual remoteipv4 is declared', () => co(function*() {
    stack.registerDependency({
      duniter: {
        cli: [{
          name: 'test4',
          desc: 'Unit Test execution',
          onConfiguredExecute: (server, conf, program, params, startServices) => co(function*() {
            conf.should.not.have.property('remotehost');
            conf.should.have.property('remoteipv6').equal(undefined);
            conf.should.have.property('remoteipv4').equal('192.168.0.1');
          })
        }]
      }
    }, 'duniter-automated-test');
    yield stack.executeStack(['node', 'index.js', 'test4',
      '--memory',
      '--remote4', '192.168.0.1',
      '--ipv4', '127.0.0.1',
      '--port', '10400'
    ]);
  }));

  it('remoteipv4 should be filled if no remote is declared, but local IPv4 is', () => co(function*() {
    stack.registerDependency({
      duniter: {
        cli: [{
          name: 'test5',
          desc: 'Unit Test execution',
          onConfiguredExecute: (server, conf, program, params, startServices) => co(function*() {
            conf.should.not.have.property('remotehost');
            conf.should.have.property('remoteipv6').equal(undefined);
            conf.should.have.property('remoteipv4').equal('127.0.0.1');
          })
        }]
      }
    }, 'duniter-automated-test');
    yield stack.executeStack(['node', 'index.js', 'test5',
      '--memory',
      '--ipv4', '127.0.0.1',
      '--port', '10400'
    ]);
  }));

  it('default IPv6 should not be a local one', () => co(function*() {
    const ipv6 = network.getBestLocalIPv6();
    if (ipv6) {
      ipv6.should.not.match(/fe80/);
    }
  }));
});

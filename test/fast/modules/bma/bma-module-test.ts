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

import {BmaDependency} from "../../../../app/modules/bma/index"
import {KeypairDependency} from "../../../../app/modules/keypair/index"
import {Network} from "../../../../app/modules/bma/lib/network"
import {Statics} from "../../../../index"

const assert = require('assert');
const should = require('should');
const rp = require('request-promise');

const stack = Statics.minimalStack();
stack.registerDependency(KeypairDependency, 'duniter-keypair');
stack.registerDependency(BmaDependency,     'duniter-bma');

describe('Module usage', () => {

  it('/node/summary should answer', async () => {
    stack.registerDependency({
      duniter: {
        cli: [{
          name: 'test1',
          desc: 'Unit Test execution',
          onDatabaseExecute: async (server:any, conf:any, program:any, params:any, startServices:any) => {
            await startServices();
          }
        }]
      }
    }, 'duniter-automated-test');
    await stack.executeStack(['node', 'index.js', 'test1',
      '--memory',
      '--noupnp',
      '--ipv4', '127.0.0.1',
      '--port', '10400'
    ]);
    const json = await rp.get({
      url: 'http://127.0.0.1:10400/node/summary',
      json: true,
      timeout: 1000
    });
    should.exist(json);
    json.should.have.property('duniter').property('software').equal('duniter');
  })

  it('remoteipv4 should NOT be filled if remote Host is declared', async () => {
    stack.registerDependency({
      duniter: {
        cli: [{
          name: 'test2',
          desc: 'Unit Test execution',
          onConfiguredExecute: async (server:any, conf:any, program:any, params:any, startServices:any) => {
            conf.should.not.have.property('remoteipv4');
            conf.should.have.property('remoteipv6').equal(undefined);
            conf.should.have.property('remotehost').equal('localhost');
          }
        }]
      }
    }, 'duniter-automated-test');
    await stack.executeStack(['node', 'index.js', 'test2',
      '--memory',
      '--ipv4',    '127.0.0.1',
      '--remoteh', 'localhost',
      '--port',    '10400'
    ]);
  })

  it('remoteipv4 should NOT be filled if remote IPv6 is declared', async () => {
    stack.registerDependency({
      duniter: {
        cli: [{
          name: 'test3',
          desc: 'Unit Test execution',
          onConfiguredExecute: async (server:any, conf:any, program:any, params:any, startServices:any) => {
            conf.should.not.have.property('remoteipv4');
            conf.should.not.have.property('remotehost');
            conf.should.have.property('remoteipv6').equal('::1');
          }
        }]
      }
    }, 'duniter-automated-test');
    await stack.executeStack(['node', 'index.js', 'test3',
      '--memory',
      '--ipv4',    '127.0.0.1',
      '--ipv6', '::1',
      '--port', '10400'
    ]);
  })

  it('remoteipv4 should be NOT be auto-filled if manual remoteipv4 is declared', async () => {
    stack.registerDependency({
      duniter: {
        cli: [{
          name: 'test4',
          desc: 'Unit Test execution',
          onConfiguredExecute: async (server:any, conf:any, program:any, params:any, startServices:any) => {
            conf.should.not.have.property('remotehost');
            conf.should.have.property('remoteipv6').equal(undefined);
            conf.should.have.property('remoteipv4').equal('192.168.0.1');
          }
        }]
      }
    }, 'duniter-automated-test');
    await stack.executeStack(['node', 'index.js', 'test4',
      '--memory',
      '--remote4', '192.168.0.1',
      '--ipv4', '127.0.0.1',
      '--port', '10400'
    ]);
  })

  it('remoteipv4 should be filled if no remote is declared, but local IPv4 is', async () => {
    stack.registerDependency({
      duniter: {
        cli: [{
          name: 'test5',
          desc: 'Unit Test execution',
          onConfiguredExecute: async (server:any, conf:any, program:any, params:any, startServices:any) => {
            conf.should.not.have.property('remotehost');
            conf.should.have.property('remoteipv6').equal(undefined);
            conf.should.have.property('remoteipv4').equal('127.0.0.1');
          }
        }]
      }
    }, 'duniter-automated-test');
    await stack.executeStack(['node', 'index.js', 'test5',
      '--memory',
      '--ipv4', '127.0.0.1',
      '--port', '10400'
    ]);
  })

  it('default IPv6 should not be a local one', async () => {
    const ipv6 = Network.getBestLocalIPv6();
    if (ipv6) {
      ipv6.should.not.match(/fe80/);
    }
  })
})

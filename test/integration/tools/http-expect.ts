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

import {Underscore} from "../../../app/lib/common-libs/underscore"

const should    = require('should');
const assert    = require('assert');

export async function expectHttpCode(code:number, message:any, promise?:any) {
  if (arguments.length == 2) {
    promise = arguments[1];
    message = undefined;
  }
  try {
    const res = await promise;
    assert.equal(res.statusCode, code);
  } catch (err) {
    if (err.response) {
      assert.equal(err.response.statusCode, code);
      if (message) {
        assert.equal(err.error || err.cause, message);
      }
    }
    else throw err;
  }
}

export async function expectError(code:number, message:any, promise?:any) {
  if (arguments.length == 2) {
    promise = arguments[1];
    message = undefined;
  }
  try {
    const res = await promise;
    assert.equal(res.statusCode, code);
  } catch (err) {
    if (err.response) {
      assert.equal(err.response.statusCode, code);
      if (message) {
        let errorObj = typeof err.error == "string" ? JSON.parse(err.error) : err.error;
        assert.equal(errorObj.message, message);
      }
    }
    else throw err;
  }
}

export async function expectJSON<T>(promise:Promise<T>, json:any) {
  try {
    const resJson = await promise;
    Underscore.keys(json).forEach(function(key){
      resJson.should.have.property(String(key)).equal(json[key]);
    });
  } catch (err) {
    if (err.response) {
      assert.equal(err.response.statusCode, 200);
    }
    else throw err;
  }
}

export async function expectAnswer<T>(promise:Promise<T>, testFunc:any) {
  try {
    const res = await promise;
    return testFunc(res);
  } catch (err) {
    if (err.response) {
      console.error(err.error);
      assert.equal(err.response.statusCode, 200);
    }
    else throw err;
  }
}

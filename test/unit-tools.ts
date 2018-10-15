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

import * as assert from 'assert'

export async function shouldThrow(promise:Promise<any>) {
  let error = false
  try {
    await promise
  } catch (e) {
    error = true
  }
  promise.should.be.rejected()
  error.should.equal(true)
}

export async function shouldNotFail<T>(promise:Promise<T>) {
  try {
    await promise
  } catch(e) {
    let err = e;
    if (typeof e === 'string') {
      err = JSON.parse((e as any).message)
    }
    should.not.exist(err);
  }
}

export const shouldFail = async (promise:Promise<any>, message:string|null = null) => {
  try {
    await promise;
    throw '{ "message": "Should have thrown an error" }'
  } catch(e) {
    let err = e
    if (typeof e === "string") {
      err = JSON.parse(e)
    }
    err.should.have.property('message').equal(message);
  }
}

export const assertThrows = async (promise:Promise<any>, message:string|null = null) => {
  try {
    await promise;
    throw "Should have thrown"
  } catch(e) {
    if (e === "Should have thrown") {
      throw e
    }
    assert.equal(e, message)
  }
}


export const assertThrowsSync = (f:() => any) => {
  try {
    f()
    throw "Should have thrown"
  } catch(e) {
    if (e === "Should have thrown") {
      throw e
    }
  }
}

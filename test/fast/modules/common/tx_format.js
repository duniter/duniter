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
var should  = require('should');
var parsers = require('../../../../app/lib/common-libs/parsers').parsers

var raw = "Version: 10\n" +
    "Type: Transaction\n" +
    "Currency: test_net\n" +
    "Blockstamp: 3-2A27BD040B16B7AF59DDD88890E616987F4DD28AA47B9ABDBBEE46257B88E945\n" +
    "Locktime: 0\n" +
    "Issuers:\n" +
    "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk\n" +
    "Inputs:\n" +
    "100000:0:D:HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:3428\n" +
    "Unlocks:\n" +
    "0:SIG(0)\n" +
    "Outputs:\n" +
    "1000:0:SIG(yGKRRB18B4eaZQdksWBZubea4VJKFSSpii2okemP7x1)\n" +
    "99000:0:SIG(HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk)\n" +
    "Comment: reessai\n" +
    "P6MxJ/2SdkvNDyIyWuOkTz3MUwsgsfo70j+rpWeQWcm6GdvKQsbplB8482Ar1HMz2q0h5V3tfMqjCuAeWVQ+Ag==\n";

describe("Transaction format", function(){

    var parser = parsers.parseTransaction;

    it('a valid block should be well formatted', () => parser.syncWrite(raw));

});

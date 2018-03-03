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
import {BMAConstants} from "./constants"

const Q = require('q');

export class ParametersService {

  static getSearch(req:any, callback:any) {
    if(!req.params || !req.params.search){
      callback("No search criteria given");
      return;
    }
    callback(null, req.params.search);
  }

  static getSearchP(req:any) {
    return Q.nbind(ParametersService.getSearch, this)(req)
  }

  static getCountAndFrom(req:any) {
    if(!req.params.from){
      throw "From is required";
    }
    if(!req.params.count){
      throw "Count is required";
    }
    const matches = req.params.from.match(/^(\d+)$/);
    if(!matches){
      throw "From format is incorrect, must be a positive integer";
    }
    const matches2 = req.params.count.match(/^(\d+)$/);
    if(!matches2){
      throw "Count format is incorrect, must be a positive integer";
    }
    return {
      count: matches2[1],
      from: matches[1]
    };
  }

  static getHash(req:any) {
    if(!req.params.hash){
      throw Error("`hash` is required");
    }
    const matches = req.params.hash.match(BMAConstants.SHA256_HASH);
    if(!matches){
      throw Error("`hash` format is incorrect, must be a SHA256 hash");
    }
    return req.params.hash;
  };

  static getMinSig(req:any){
    if(!req.params.minsig){
      return 4 // Default value
    }
    const matches = req.params.minsig.match(/\d+/)
    if(!matches){
      throw Error("`minsig` format is incorrect, must be an integer")
    }
    return parseInt(req.params.minsig)
  }

  static getPubkey = function (req:any, callback:any){
    if(!req.params.pubkey){
      callback('Parameter `pubkey` is required');
      return;
    }
    const matches = req.params.pubkey.match(BMAConstants.PUBLIC_KEY);
    if(!matches){
      callback("Pubkey format is incorrect, must be a Base58 string");
      return;
    }
    callback(null, matches[0]);
  }

  static getPubkeyP(req:any) {
    return Q.nbind(ParametersService.getPubkey, this)(req)
  }

  static getFrom(req:any, callback:any){
    if(!req.params.from){
      callback('Parameter `from` is required');
      return;
    }
    const matches = req.params.from.match(/^(\d+)$/);
    if(!matches){
      callback("From format is incorrect, must be a positive or zero integer");
      return;
    }
    callback(null, matches[0]);
  }

  static getFromP(req:any) {
    return Q.nbind(ParametersService.getFrom, this)(req)
  }

  static getTo(req:any, callback:any){
    if(!req.params.to){
      callback('Parameter `to` is required');
      return;
    }
    const matches = req.params.to.match(/^(\d+)$/);
    if(!matches){
      callback("To format is incorrect, must be a positive or zero integer");
      return;
    }
    callback(null, matches[0]);
  }

  static getToP(req:any) {
    return Q.nbind(ParametersService.getTo, this)(req)
  }

  static getNumber(req:any, callback:any){
    if(!req.params.number){
      callback("Number is required");
      return;
    }
    const matches = req.params.number.match(/^(\d+)$/);
    if(!matches){
      callback("Number format is incorrect, must be a positive integer");
      return;
    }
    callback(null, parseInt(matches[1]));
  }

  static getNumberP(req:any) {
    return Q.nbind(ParametersService.getNumber, this)(req)
  }
}

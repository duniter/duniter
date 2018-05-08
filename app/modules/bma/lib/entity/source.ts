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

import {Underscore} from "../../../../lib/common-libs/underscore"

export class Source {

  [k:string]: any

  constructor(json:any) {
    Underscore.keys(json || {}).forEach((key:string) => {
      let value = json[key];
      if (key == "number") {
        value = parseInt(value);
      }
      else if (key == "consumed") {
        value = !!value;
      }
      this[key] = value;
    })
  }

  json() {
    return {
      "type": this.type,
      "noffset": this.pos,
      "identifier": this.identifier,
      "amount": this.amount,
      "conditions": this.conditions,
      "base": this.base
    };
  };

  UDjson() {
    return {
      "block_number": this.number,
      "consumed": this.consumed,
      "time": this.time,
      "amount": this.amount,
      "base": this.base
    };
  };
}

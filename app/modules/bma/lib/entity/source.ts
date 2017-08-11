"use strict";
const _ = require('underscore');

export class Source {

  [k:string]: any

  constructor(json:any) {
    _(json || {}).keys().forEach((key:string) => {
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

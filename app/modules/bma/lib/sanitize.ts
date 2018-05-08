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

import {Underscore} from "../../../lib/common-libs/underscore"

module.exports = function sanitize (json:any, contract:any) {

  // Tries to sanitize only if contract is given
  if (contract) {

    if (Object.prototype.toString.call(contract) === "[object Array]") {
      // Contract is an array

      if (Object.prototype.toString.call(json) !== "[object Array]") {
        json = [];
      }

      for (let i = 0, len = json.length; i < len; i++) {
        json[i] = sanitize(json[i], contract[0]);
      }
    } else {
      // Contract is an object or native type

      // Return type is either a string, a number or an object
      if (typeof json != typeof contract) {
        try {
          // Cast value
          json = contract(json);
        } catch (e) {
          // Cannot be casted: create empty value
          json = contract();
        }
      }

      let contractFields = Underscore.keys(contract)
      let objectFields = Underscore.keys(json)
      let toDeleteFromObj = Underscore.difference(objectFields, contractFields)

      // Remove unwanted fields
      for (let i = 0, len = toDeleteFromObj.length; i < len; i++) {
        let field = toDeleteFromObj[i];
        delete json[field];
      }

      // Format wanted fields
      for (let i = 0, len = contractFields.length; i < len; i++) {
        let prop = contractFields[i];
        let propType = contract[prop];
        let t = "";
        if (propType.name) {
          t = propType.name;
        } else if (propType.length != undefined) {
          t = 'Array';
        } else {
          t = 'Object';
        }
        // Test json member type
        let tjson:any = typeof json[prop];
        if (~['Array', 'Object'].indexOf(t)) {
          if (tjson == 'object' && json[prop] !== null) {
            tjson = json[prop].length == undefined ? 'Object' : 'Array';
          }
        }
        // Check coherence & alter member if needed
        if (json[prop] !== null && t.toLowerCase() != tjson.toLowerCase()) {
          try {
            if (t == "String") {
              let s = json[prop] == undefined ? '' : json[prop];
              json[prop] = String(s).valueOf();
            }
            else if (t == "Number") {
              let s = json[prop] == undefined ? '' : json[prop];
              json[prop] = Number(s).valueOf();
            }
            else if (t == "Array") {
              json[prop] = [];
            }
            else if (t == "Object") {
              json[prop] = {};
            }
            else {
              json[prop] = Boolean();
            }
          } catch (ex) {
            if (t == "String") {
              json[prop] = String();
            }
            else if (t == "Number") {
              json[prop] = Number();
            }
            else if (t == "Array") {
              json[prop] = [];
            }
            else if (t == "Object") {
              json[prop] = {};
            }
            else {
              json[prop] = Boolean();
            }
          }
        }
        // Arrays
        if (t == 'Array') {
          let subt = propType[0];
          for (let j = 0, len2 = json[prop].length; j < len2; j++) {
            if (!(subt == "String" || subt == "Number")) {
              json[prop][j] = sanitize(json[prop][j], subt);
            }
          }
        }
        // Recursivity
        if (t == 'Object' && json[prop] !== null) {
          json[prop] = sanitize(json[prop], contract[prop]);
        }
      }
    }
  }
  return json;
};

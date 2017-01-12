"use strict";

let _ = require('underscore');

module.exports = function sanitize (json, contract) {

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

      let contractFields = _(contract).keys();
      let objectFields = _(json).keys();
      let toDeleteFromObj = _.difference(objectFields, contractFields);

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
        let tjson = typeof json[prop];
        if (~['Array', 'Object'].indexOf(t)) {
          if (tjson == 'object' && json[prop] !== null) {
            tjson = json[prop].length == undefined ? 'Object' : 'Array';
          }
        }
        // Check coherence & alter member if needed
        if (!_(json[prop]).isNull() && t.toLowerCase() != tjson.toLowerCase()) {
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

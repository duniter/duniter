"use strict";

const co = require('co');

module.exports = SandBox;

function SandBox(maxSize, findElements, compareElements) {

  const that = this;
  this.maxSize = maxSize || 10;
  
  this.acceptNewSandBoxEntry = (element, pubkey) => co(function *() {
    if (element.pubkey === pubkey) {
      return true;
    }
    const elements = yield findElements();
    if (elements.length < that.maxSize) {
      return true;
    }
    const lowestElement = elements[elements.length - 1];
    const comparison = compareElements(element, lowestElement);
    return comparison > 0;
  });

  this.getSandboxRoom = () => co(function *() {
    const elems = yield findElements();
    return that.maxSize - elems.length;
  });
}

// Written in 2014-2016 by Dmitry Chestnykh and Devi Mandiri.
// Public domain.
(function(root, f) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else if (root.nacl) root.nacl.util = f();
  else {
    root.nacl = {};
    root.nacl.util = f();
  }
}(this, function() {
  'use strict';

  let util = {};

  util.decodeUTF8 = function(s) {
    let i, d = unescape(encodeURIComponent(s)), b = new Uint8Array(d.length);
    for (i = 0; i < d.length; i++) b[i] = d.charCodeAt(i);
    return b;
  };

  util.encodeUTF8 = function(arr) {
    let i, s = [];
    for (i = 0; i < arr.length; i++) s.push(String.fromCharCode(arr[i]));
    return decodeURIComponent(escape(s.join('')));
  };

  util.encodeBase64 = function(arr) {
    if (typeof btoa === 'undefined' || !window) {
      return (new Buffer(arr)).toString('base64');
    } else {
      let i, s = [], len = arr.length;
      for (i = 0; i < len; i++) s.push(String.fromCharCode(arr[i]));
      return btoa(s.join(''));
    }
  };

  util.decodeBase64 = function(s) {
    if (typeof atob === 'undefined' || !window) {
      return new Uint8Array(Array.prototype.slice.call(new Buffer(s, 'base64'), 0));
    } else {
      let i, d = atob(s), b = new Uint8Array(d.length);
      for (i = 0; i < d.length; i++) b[i] = d.charCodeAt(i);
      return b;
    }
  };

  return util;

}));

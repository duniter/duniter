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

declare function escape(s:string): string;
declare function unescape(s:string): string;

export const decodeUTF8 = function(s:string) {
  let i, d = unescape(encodeURIComponent(s)), b = new Uint8Array(d.length);
  for (i = 0; i < d.length; i++) b[i] = d.charCodeAt(i);
  return b;
}

export const encodeUTF8 = function(arr:any[]) {
  let i, s = [];
  for (i = 0; i < arr.length; i++) s.push(String.fromCharCode(arr[i]));
  return decodeURIComponent(escape(s.join('')))
}

export const encodeBase64 = function(arr:Uint8Array) {
  if (typeof btoa === 'undefined' || !window) {
    return (new Buffer(arr)).toString('base64');
  } else {
    let i, s = [], len = arr.length;
    for (i = 0; i < len; i++) s.push(String.fromCharCode(arr[i]));
    return btoa(s.join(''));
  }
}

export const decodeBase64 = function(s:string) {
  if (typeof atob === 'undefined' || !window) {
    return new Uint8Array(Array.prototype.slice.call(new Buffer(s, 'base64'), 0));
  } else {
    let i, d = atob(s), b = new Uint8Array(d.length);
    for (i = 0; i < d.length; i++) b[i] = d.charCodeAt(i);
    return b;
  }
}
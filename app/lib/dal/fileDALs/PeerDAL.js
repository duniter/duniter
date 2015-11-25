/**
 * Created by cgeek on 22/08/15.
 */

var Q = require('q');
var AbstractLoki = require('./AbstractLoki');

module.exports = PeerDAL;

function PeerDAL(loki) {

  "use strict";

  let collection = loki.getCollection('peers') || loki.addCollection('peers', { indices: ['pubkey', 'status'] });

  AbstractLoki.call(this, collection);

  this.idKeys = ['pubkey'];
  this.propsToSave = [
    'version',
    'currency',
    'status',
    'statusTS',
    'hash',
    'first_down',
    'last_try',
    'pub',
    'pubkey',
    'block',
    'signature',
    'endpoints',
    'raw'
  ];

  this.init = () => null;

  this.listAll = () => Q(collection.find());

  this.getPeer = (pubkey) => Q(collection.find({ pubkey: pubkey })[0]);

  this.savePeer = (peer) => this.lokiSave(peer);
}

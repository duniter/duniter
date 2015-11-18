/**
 * Created by cgeek on 22/08/15.
 */

var Q = require('q');
var AbstractLoki = require('./AbstractLoki');

module.exports = CertDAL;

function CertDAL(loki) {

  "use strict";

  let collection = loki.getCollection('certs') || loki.addCollection('certs', { indices: ['from', 'target', 'linked', 'written'] });

  AbstractLoki.call(this, collection);

  this.idKeys = ['sig', 'from', 'target'];
  this.propsToSave = [
    'linked',
    'written_block',
    'written_hash',
    'sig',
    'block_number',
    'block_hash',
    'target',
    'to',
    'from',
    'block'
  ];

  this.init = () => null;

  this.getToTarget = (hash) => this.lokiFind({
    target: hash
  });

  this.getFromPubkey = (pubkey) => this.lokiFind({
    from: pubkey
  });

  this.getNotLinked = () => this.lokiFindInAll({
    linked: false
  });

  this.getNotLinkedToTarget = (hash) => this.lokiFind({
    target: hash
  },{
    linked: false
  });

  this.listLocalPending = () => Q([]);

  this.saveOfficial = (cert) => {
    cert.linked = true;
    return this.lokiSave(cert);
  };

  this.saveNewCertification = (cert) =>
    this.lokiSave(cert);

  this.existsGivenCert = (cert) => Q(this.lokiExisting(cert));
}
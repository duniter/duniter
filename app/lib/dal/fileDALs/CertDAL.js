/**
 * Created by cgeek on 22/08/15.
 */

var Q = require('q');
var AbstractLoki = require('./AbstractLoki');

module.exports = CertDAL;

function CertDAL(fileDAL, loki) {

  "use strict";

  let collection = loki.getCollection('certs') || loki.addCollection('certs', { indices: ['from', 'target', 'linked', 'written'] });
  let blockCollection = loki.getCollection('blocks');
  let current = blockCollection.chain().find({ fork: false }).simplesort('number', true).limit(1).data()[0];
  let blocks = [], p = fileDAL;
  let branchView;
  while (p) {
    if (p.core) {
      blocks.push(p.core);
    }
    p = p.parentDAL;
  }
  let conditions = blocks.map((b) => {
    return {
      $and: [{
        block_number: b.forkPointNumber
      }, {
        block_hash: b.forkPointHash
      }]
    };
  });
  conditions.unshift({
    block_number: { $lte: current ? current.number : -1 }
  });
  branchView = collection.addDynamicView(['branch', fileDAL.name].join('_'));
  branchView.applyFind({ '$or': conditions });
  branchView.conditions = conditions;

  AbstractLoki.call(this, collection, fileDAL);

  this.idKeys = ['sig', 'from', 'target'];
  this.metaProps = ['linked'];

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
var ucoin    = require('./../..');
var async    = require('async');
var should   = require('should');
var fs       = require('fs');
var unix2dos = require('../../app/lib/unix2dos');
var parsers  = require('../../app/lib/streams/parsers/doc');
var logger   = require('../../app/lib/logger')('[peerserver]');

var pubkeyCatRaw = unix2dos(fs.readFileSync(__dirname + '/../data/lolcat.pub', 'utf8'));
var pubkeySnowRaw = unix2dos(fs.readFileSync(__dirname + '/../data/snow.pub', 'utf8'));
var pubkeyUbot1Raw = unix2dos(fs.readFileSync(__dirname + '/../data/ubot1.pub', 'utf8'));
var privkeyUbot1Raw = unix2dos(fs.readFileSync(__dirname + '/../data/ubot1.priv', 'utf8'));

var pubkeyCat, pubkeySnow, pubkeyUbot1;
var peerServer;

before(function (done) {
  async.parallel({
    cat: function(callback){
      parsers.parsePubkey().asyncWrite(pubkeyCatRaw, function (err, obj) {
        pubkeyCat = obj;
        callback(err);
      });
    },
    snow: function(callback){
      parsers.parsePubkey().asyncWrite(pubkeySnowRaw, function (err, obj) {
        pubkeySnow = obj;
        callback(err);
      });
    },
    ubot1: function(callback){
      parsers.parsePubkey().asyncWrite(pubkeyUbot1Raw, function (err, obj) {
        pubkeyUbot1 = obj;
        callback(err);
      });
    },
    server: function (callback) {
      peerServer = ucoin.createPeerServer({ name: 'hdc2', listenBMA: false, resetData: true }, {
        pgpkey: privkeyUbot1Raw,
        pgppasswd: 'ubot1',
        currency: 'beta_brousouf',
        ipv4: '127.0.0.1',
        port: 8080,
        remoteipv4: '127.0.0.1',
        remoteport: 8080
      });
      peerServer.on('services', callback);
    }
  }, done);
})

describe('A server', function () {

  this.timeout(1000*5);

  beforeEach(function (done) {
    peerServer.reset(done);
  })

  // afterEach(function (done) {
  //   peerServer.disconnect(done);
  // })
  
  it('Peer should emit error on wrong data type', function (done) {
    peerServer.on('error', function (err) {
      should.exist(err);
      done();
    });
    peerServer.write({ some: 'data' });
  });
  
  it('Peer should accept pubkeys', function (done) {
    async.parallel({
      pubkey: until(peerServer, 'pubkey'),
    }, done);
    peerServer.write(pubkeyCat);
  });
  
  it('Peer should accept forwards & status', function (done) {
    async.parallel({
      forward: until(peerServer, 'forward'),
      status:  until(peerServer, 'status'),
      wallet:  until(peerServer, 'wallet'),
    }, done);
    peerServer.write(pubkeyCat);
    peerServer.write({
      "version": "1",
      "currency": "beta_brousouf",
      "fingerprint": "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
      "endpoints": [
        "BASIC_MERKLED_API 127.0.0.1 8080"
      ],
      "keyID": "E9CAB76D19A8651E",
      "signature": "-----BEGIN PGP SIGNATURE-----\r\nVersion: OpenPGP.js VERSION\r\nComment: http://openpgpjs.org\r\n\r\nwsBcBAEBCAAQBQJTlsmOCRDpyrdtGahlHgAAGPoIANAv8Q6PtaLuCzD9aDH+\nue9G10QNsXBCOIErj7wocmct3Y9yeYBwyAfth+ia0K/YDgygOY+n1yKid6QD\nlEOaDSENcdONZlYO/zAHDu6vQR/zsAPyztRCp0TSOCxQcQV2xSFkSvUSF8g2\noNI8RETgpLIlbKE8sS3F4v5OcxSa6wkhgngqRL6ZmqYqTPzgsAXlguA/Tq48\nNwRUQZBeP/TnMvnhhaZeww5qgxMNKWAMIjv7RUvMoP+YMMwSpgIKD3QYOhFK\nZLfYnxhiS/1jtJ+GTVdPLr5MNjLnNAc195aBT7OGi2frIsr7Qhz6TdMQnh0b\n39ohs+qaacQFbPS8qyVbhsM=\r\n=0nGP\r\n-----END PGP SIGNATURE-----\r\n",
      "pubkey": { fingerprint: "C73882B64B7E72237A2F460CE9CAB76D19A8651E" }
    });
    peerServer.write({
      "version": "1",
      "currency": "beta_brousouf",
      "from": "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
      "to": "D049002A6724D35F867F64CC087BA351C0AEB6DF",
      "keyID": "E9CAB76D19A8651E",
      "forward": "ALL",
      "signature": "-----BEGIN PGP SIGNATURE-----\r\nVersion: OpenPGP.js VERSION\r\nComment: http://openpgpjs.org\r\n\r\nwsBcBAEBCAAQBQJThMLbCRAIe6NRwK623wAA3GMIAIvzPBWfTZfR27vJM0v+\nU5Tv1ro8G2zrBGaTG+qe5ZXNxjgtKjtx6v1XY3zDo8s8IEAoTt09mp5M+Iz9\nPQ1eD3ThPF5Eulc+ZfN8Gqahwqro0gU0YJ6VetXdTsULNm9FJOEy3xToTcvu\nR9bmRNwrIoBRLVECRl5nRcgXCN2ETw7rejVlWSKQbNJKnh13cd65pJIYe4z6\nLDic65WyV5RL12H33F0yoEkL5Srq54iGsqtDjSKH4pCclKOc2tbmqQtS6DDQ\nggPOGrkNAbm3T7fii+UQfmT820gz938iYs/8x3kvQuWOYJgNdbfjbBi+qmg5\nZz3+PPOaiWzLKhdul/rFk5M=\r\n=alII\r\n-----END PGP SIGNATURE-----\r\n"
    });
    peerServer.write({
      "version": "1",
      "currency": "beta_brousouf",
      "status": "UP",
      "keyID": "E9CAB76D19A8651E",
      "pubkey": { fingerprint: "C73882B64B7E72237A2F460CE9CAB76D19A8651E" }
    });
    peerServer.write({
      "version": "1",
      "currency": "beta_brousouf",
      "fingerprint": "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
      "requiredTrusts": 1,
      "hosters": [
        "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
        "C73882B64B7E72237A2F460CE9CAB76D19A8651E"
      ],
      "trusts": [
        "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
        "C73882B64B7E72237A2F460CE9CAB76D19A8651E"
      ],
      "date": new Date(),
      "keyID": "E9CAB76D19A8651E",
      "pubkey": { fingerprint: "C73882B64B7E72237A2F460CE9CAB76D19A8651E" },
      "signature": "-----BEGIN PGP SIGNATURE-----\nVersion: GnuPG v1\n\niQEcBAABCAAGBQJTltBaAAoJED0ZtAvOQO311hYH/RxCRmDbpGZ4OKsJ283MjHI1\nu1Teh/SDWuTjeGld8m76v7Yu61PA4vb4YzTldNvGg1sBoFKy2yH/UXTxTuM2WOJh\nVnzb1BhR4Nbl3+N4E7q/0JndTv+N34c4z3gltOJJQ1VtudYFEnzRxxJPsgc8OTTm\nWmwNUu8lUE3MEI3P10TXfKcU+WmATYj2+VtK6GHjKAqjY5Lnctz94nyHLr2M5+7E\nkJ/9CkXKulTG3qTpwFL3HsILQJO93CGXjDFrdbWcq+RIRbMXWnM4ibQf7lQ1TMKK\n7Z8rKWvyGn6sHkM34OcAPd2dORwtxuCTMLtcHFUp5lxXWkT/CZEGOh9XlcilVXc=\n=ylC/\n-----END PGP SIGNATURE-----\n",
    });
  });
  
  it('Peer should accept peerings', function (done) {
    async.parallel({
      peer: until(peerServer, 'peer'),
    }, done);
    peerServer.write(pubkeyCat);
    peerServer.write({
      "version": "1",
      "currency": "beta_brousouf",
      "fingerprint": "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
      "keyID": "E9CAB76D19A8651E",
      "endpoints": [
        "BASIC_MERKLED_API 127.0.0.1 8090"
      ],
      "signature": "-----BEGIN PGP SIGNATURE-----\r\nVersion: OpenPGP.js VERSION\r\nComment: http://openpgpjs.org\r\n\r\nwsBcBAEBCAAQBQJTmIfQCRDpyrdtGahlHgAAPboIAIILjXEgODUmkq0shKi+\n+BsOnZNSQ6dzmUYtqjsN83VyqsDIDZSKqQz3khXgDqcAVBXQcaL3oSrZOv70\n53E7oCKh+dOnAuOGrmWUUc2T0lkxppiwINQ9o8JqzDp9qpH8fSlFQu0HWuq/\noYar5B64Tp+dRoUY6iP3qqOpKKRLVj3z8vKJFyRXULNbawQPtrWem5OLatP2\nJw16pK04+IuMdA1+6+t/aeiqIoS/KRT2XlqrJe9nV5YXPC7KlXI80kd0sCEy\nuc7h/WIxkOlTfeXLuSRnQD+JMUKagMvoL7DbjvIgRlPhHp1xk1VjWkqBzBof\ntsf7xfAms830g9nsYnkvy30=\r\n=1kYK\r\n-----END PGP SIGNATURE-----\r\n",
      "pubkey": { fingerprint: "C73882B64B7E72237A2F460CE9CAB76D19A8651E" }
    });
  });
  
  it('Peer should accept transactions', function (done) {
    async.parallel({
      transaction: until(peerServer, 'transaction'),
    }, done);
    peerServer.write(pubkeyUbot1);
    peerServer.write({
      amendment: {
        "version": 1,
        "number": 0,
        "generated": 1398895200,
        "nextVotes": 1,
        "dividend": null,
        "coinBase": null,
        "votersCount": 1,
        "membersCount": 3,
        "currency": "beta_brousouf",
        "votersRoot": "D049002A6724D35F867F64CC087BA351C0AEB6DF",
        "membersRoot": "2A22E19061A41EB95F628F7EFB8FB2DAF6BAB4FE",
        "coinAlgo": "Base2Draft",
        "previousHash": null,
        "coinList": [],
        "votersChanges": [
          "+D049002A6724D35F867F64CC087BA351C0AEB6DF"
        ],
        "membersChanges": [
          "+2E69197FAB029D8669EF85E82457A1587CA0ED9C",
          "+C73882B64B7E72237A2F460CE9CAB76D19A8651E",
          "+D049002A6724D35F867F64CC087BA351C0AEB6DF"
        ]
      },
      "pubkey": { fingerprint: "D049002A6724D35F867F64CC087BA351C0AEB6DF" },
      "sigDate": new Date()
    });
    peerServer.write({
      amendment: {
        "version": 1,
        "number": 1,
        "generated": 1398981600,
        "nextVotes": 1,
        "dividend": null,
        "coinBase": null,
        "votersCount": 1,
        "membersCount": 3,
        "currency": "beta_brousouf",
        "votersRoot": "D049002A6724D35F867F64CC087BA351C0AEB6DF",
        "membersRoot": "2A22E19061A41EB95F628F7EFB8FB2DAF6BAB4FE",
        "coinAlgo": "Base2Draft",
        "previousHash": "65A55999086155BF6D3E4EB5D475E46E4E2307D2",
        "coinList": [],
        "votersChanges": [],
        "membersChanges": []
      },
      "pubkey": { fingerprint: "D049002A6724D35F867F64CC087BA351C0AEB6DF" },
      "sigDate": new Date()
    });
    peerServer.write({
      amendment: {
        "version": 1,
        "number": 2,
        "generated": 1399068000,
        "nextVotes": 1,
        "dividend": 100,
        "coinBase": 0,
        "votersCount": 1,
        "membersCount": 3,
        "currency": "beta_brousouf",
        "votersRoot": "D049002A6724D35F867F64CC087BA351C0AEB6DF",
        "membersRoot": "2A22E19061A41EB95F628F7EFB8FB2DAF6BAB4FE",
        "coinAlgo": "Base2Draft",
        "previousHash": "8EDE25D246E3402A6D5AF31B1D9AA02239B80452",
        "coinList": [
          26,
          7,
          5,
          3,
          1
        ],
        "votersChanges": [],
        "membersChanges": []
      },
      "pubkey": { fingerprint: "D049002A6724D35F867F64CC087BA351C0AEB6DF" },
      "sigDate": new Date()
    });
    peerServer.write({
      "signature": "-----BEGIN PGP SIGNATURE-----\r\nVersion: GnuPG v1.4.15 (GNU/Linux)\r\n\r\niQEcBAABAgAGBQJThe/DAAoJEDwCajRJsiQWeaUH/iAtPE1yph+7+1SxmCvJ1NaT\r\ngyyI5t86b72NmgslAoexC5xsPUnwwZPBUjMCR0xLO4x1FOEwYoMYyKCvNRKdKbKe\r\nDQ1z+chCMP+sHMl/4PG7di4PT+OE5Oqgrbi8Gq1HRA4l5iamyxOoInNUoSCjxe2g\r\n4HFLPN40Hv9ovWKDlKx14hTVbN2xlnAwf3LlCOiCQsC+YWCvawAbwWL1PBvNJmF8\r\ntAW3fjFKbMlzkTLMgAWUUviozZUedScgVQ443TMxJdvnh+SCDoLqNI573I7lRy41\r\n3DzGp913OU4iTFcgHCK6XnvNw3ycqYpdIW22rniWJewartHJJQfFWX1VAMSfhIc=\r\n=QxTg\r\n-----END PGP SIGNATURE-----\r\n",
      "version": 1,
      "currency": "beta_brousouf",
      "sender": "D049002A6724D35F867F64CC087BA351C0AEB6DF",
      "number": 0,
      "previousHash": null,
      "recipient": "D049002A6724D35F867F64CC087BA351C0AEB6DF",
      "coins": [
        "D049002A6724D35F867F64CC087BA351C0AEB6DF-2-12",
        "D049002A6724D35F867F64CC087BA351C0AEB6DF-2-14"
      ],
      "sigDate": new Date(),
      "comment": "",
      "pubkey": { fingerprint: "D049002A6724D35F867F64CC087BA351C0AEB6DF" },
    });
  });
})

function until (server, eventName, count) {
  var counted = 0;
  var max = count == undefined ? 1 : count;
  return function (callback) {
    server.on(eventName, function (obj) {
      logger.trace('event = %s', eventName);
      should.exist(obj);
      counted++;
      if (counted == max)
        callback();
    });
  }
}
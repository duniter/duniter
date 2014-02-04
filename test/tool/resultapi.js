
module.exports = function () {
  return function () {
    return new ResultAPI();
  };
}

function ResultAPI () {
  
  this.apiRes = {};
  this.apiStack = [];

  this.pksAllIndex = 0;
  this.pksAddIndex = 0;
  this.pksLookupIndex = 0;
  this.joinIndex = 0;
  this.keysIndex = 0;

  this.push = function (url, res) {
    if(!this.apiRes[url]) this.apiRes[url] = [];
    this.apiRes[url].push({ res: res });
    this.apiStack.push(url);
  };

  this.last = function () {
    return this.apiRes[this.apiStack[this.apiStack.length - 1]][_(this.apiRes).size() - 1].res;
  };

  this.pksAll = function(status, expectCount, expectHash) {
    var index = this.pksAllIndex++;
    var obj = this;
    it('expect to see ' + expectCount + ' keys with root hash ' + expectHash, function () {
      var res = obj.apiRes['/pks/all'][index].res;
      var json = JSON.parse(res.text);
      res.should.have.status(status);
      isMerkleNodesResult(json);
      json.leavesCount.should.equal(expectCount);
      if(expectCount == 0){
        json.levels.should.have.property("0");
        json.levels["0"].should.have.length(0);
        json.levels["0"].should.have.length(0);
      }
      else{
        json.levels.should.have.property("0");
        json.levels["0"].should.have.length(1);
        json.levels["0"][0].should.equal(expectHash);
      }
    })
  };

  this.pksAdd = function(status) {
    var index = this.pksAddIndex++;
    var obj = this;
    it('expect to have status ' + status + ' for pks/add', function () {
      var res = obj.apiRes['/pks/add'][index].res;
      res.should.have.status(status);
      if(status == 200){
        var json = JSON.parse(res.text);
        isPubKey(json);
      }
    })
  };

  this.pksLookup = function(status, keyCount) {
    var index = this.pksLookupIndex++;
    var obj = this;
    it('expect to have status ' + status + ' and ' + keyCount + ' keys for pks/lookup', function () {
      var res = obj.apiRes['/pks/lookup?op=index&search='][index].res;
      var json = JSON.parse(res.text);
      res.should.have.status(status);
      json.should.have.property('keys');
      json.keys.length.should.equal(keyCount);
    })
  };

  this.coinsList = function(type, owner, coinsCount, issuersCount) {
    issuersCount = issuersCount || 1;
    if(!this['indexOf' + owner])
      this['indexOf' + owner] = 0;
    var index = this['indexOf' + owner]++;
    var obj = this;
    it(type + ' of owner ' + owner + ' should respond 200 with ' + coinsCount + ' coins', function () {
      var url = '/hdc/coins/'+owner+'/list';
      var res = obj.apiRes[url][index].res;
      var json = JSON.parse(res.text);
      res.should.have.status(200);
      json.owner.should.equal(owner);
      if(coinsCount > 0){
        json.coins.should.have.length(issuersCount);
        var count = 0;
        json.coins.forEach(function (coins) {
          count += coins.ids.length;
        });
        count.should.equal(coinsCount);
      }
      else{
        json.coins.should.have.length(0);
      }
    });
  };

  this.txAllMerkle = function(type, root, txCount) {
    if(!this['indexTxAll'])
      this['indexTxAll'] = 0;
    var index = this['indexTxAll']++;
    var obj = this;
    it('after ' + type + ' tx/all should respond 200 with ' + txCount + ' transactions', function () {
      var url = '/hdc/transactions/all';
      checkTxMerkle(obj, url, index, txCount, root);
    });
  };

  this.txSenderMerkle = function(type, owner, root, txCount) {
    checkTxMerklePath(this, '/sender', '', 'sender', type, owner, root, txCount);
  };

  this.txIssuerMerkle = function(type, owner, root, txCount) {
    checkTxMerklePath(this, '/sender', '/issuance', 'issuance', type, owner, root, txCount);
  };

  this.txIssuerDividendMerkle = function(type, owner, root, txCount) {
    checkTxMerklePath(this, '/sender', '/issuance/dividend', 'dividend', type, owner, root, txCount);
  };

  this.txIssuerDividen2dMerkle = function(type, owner, root, txCount) {
    checkTxMerklePath(this, '/sender', '/issuance/dividend/2', 'dividend2', type, owner, root, txCount);
  };

  this.txIssuerTransfertMerkle = function(type, owner, root, txCount) {
    checkTxMerklePath(this, '/sender', '/transfert', 'transfert', type, owner, root, txCount);
  };

  this.txIssuerFusionMerkle = function(type, owner, root, txCount) {
    checkTxMerklePath(this, '/sender', '/issuance/fusion', 'fusion', type, owner, root, txCount);
  };

  this.txRecipientMerkle = function(type, owner, root, txCount) {
    checkTxMerklePath(this, '/recipient', '', 'recipient', type, owner, root, txCount);
  };

  function checkTxMerklePath(obj, pathRoot, path, name, type, owner, root, txCount) {
    if(!obj['specialIndex'+name+owner])
      obj['specialIndex'+name+owner] = 0;
    var index = obj['specialIndex'+name+owner]++;
    it('after ' + type + ' tx of owner '+owner+' should respond 200 with ' + txCount + ' transactions', function () {
      var url = '/hdc/transactions'+pathRoot+'/'+owner+path;
      checkTxMerkle(obj, url, index, txCount, root);
    });
  }

  function checkTxMerkle(obj, url, index, txCount, root){
    var res = obj.apiRes[url][index].res;
    var json = JSON.parse(res.text);
    res.should.have.status(200);
    isMerkleNodesResult(json);
    json.leavesCount.should.equal(txCount);
    if(txCount > 0)
      json.levels[0][0].should.equal(root);
    else
      should.not.exist(json.levels[0][0]);
  }

  this.keys = function(comment, leavesCount, root) {
    var index = this.keysIndex++;
    var obj = this;
    it('expect ' + comment, function () {
      var res = obj.apiRes['/hdc/transactions/keys'][index].res;
      var json = JSON.parse(res.text);
      res.should.have.status(200);
      isMerkleNodesResult(json);
      if(root)
        json.levels[0][0].should.equal(root);
      else
        _(json.levels[0]).size().should.equal(0);
    });
  };

  this.downstream = function(comment, streamsCount, fingerprint) {
    testStreams(this, 'down', comment, streamsCount, fingerprint);
  };

  this.upstream = function(comment, streamsCount, fingerprint) {
    testStreams(this, 'up', comment, streamsCount, fingerprint);
  };

  function testStreams(obj, type, comment, streamsCount, fingerprint) {
    if(!obj[type+'streamIndex'+fingerprint])
      obj[type+'streamIndex'+fingerprint] = 0;
    var index = obj[type+'streamIndex'+fingerprint]++;
    var obj = obj;
    it((fingerprint ? 'for fingerprint '+fingerprint+' ' : '')+'expect '+ comment, function () {
      var res = obj.apiRes['/ucg/peering/peers/'+type+'stream' + (fingerprint ? '/'+fingerprint : '')][index].res;
      var json = JSON.parse(res.text);
      res.should.have.status(200);
      json.should.have.property('peers');
      json.peers.should.have.length(streamsCount);
    });
  };

  this.checkPromoted = function(number, statusCode, hash) {
    if(!this['promoted'+number])
      this['promoted'+number] = 0;
    var index = this['promoted'+number]++;
    var obj = this;
    it('- #'+number+' should '+(statusCode == 200 ? '' : 'not ')+'exist', function () {
      var res = obj.apiRes['/hdc/amendments/promoted' + (number != null ? '/'+number : '')][index].res;
      res.should.have.status(statusCode);
      if(statusCode == 200){
        var json = JSON.parse(res.text);
        json.should.have.property('version');
        json.should.have.property('currency');
        json.should.have.property('number');
        json.should.have.property('generated');
        json.should.have.property('dividend');
        json.should.have.property('coinMinPower');
        json.should.have.property('previousHash');
        json.should.have.property('previousVotesRoot');
        json.should.have.property('previousVotesCount');
        json.should.have.property('membersRoot');
        json.should.have.property('membersCount');
        json.should.have.property('membersChanges');
        json.should.have.property('votersRoot');
        json.should.have.property('votersCount');
        json.should.have.property('votersChanges');
        json.should.have.property('raw');
        var mHash = sha1(json.raw).toUpperCase();
        mHash.should.equal(hash);
      }
    });
  };

  this.checkProcessedTX = function(comment, statusCode) {
    if(!this['transaction'])
      this['transaction'] = 0;
    var index = this['transaction']++;
    var obj = this;
    it(comment+' should '+(statusCode == 200 ? '' : 'not ')+'exist', function () {
      var res = obj.apiRes['/hdc/transactions/process'][index].res;
      res.should.have.status(statusCode);
      if(statusCode == 200){
        var json = JSON.parse(res.text);
        json.should.have.property('signature');
        json.should.have.property('raw');
        json.should.have.property('transaction');
        json.transaction.should.have.property('version');
        json.transaction.should.have.property('currency');
        json.transaction.should.have.property('sender');
        json.transaction.should.have.property('number');
        if(json.transaction.number > 0)
          json.transaction.should.have.property('previousHash');
        json.transaction.should.have.property('recipient');
        json.transaction.should.have.property('type');
        json.transaction.should.have.property('coins');
        json.transaction.should.have.property('comment');
        // var mHash = sha1(json.raw).toUpperCase();
        // mHash.should.equal(hash);
      }
    });
  };

  this.postTHT = function(comment, statusCode, issuer) {
    if(!this['tht'])
      this['tht'] = 0;
    var index = this['tht']++;
    var obj = this;
    it(comment+' should '+(statusCode == 200 ? '' : 'not ')+'exist', function () {
      var res = obj.apiRes['/ucg/tht'][index].res;
      res.should.have.status(statusCode);
      if(statusCode == 200){
        var json = JSON.parse(res.text);
        json.should.have.property('signature');
        json.should.have.property('entry');
        json.entry.should.have.property('version');
        json.entry.should.have.property('currency');
        json.entry.should.have.property('fingerprint');
        json.entry.should.have.property('hosters');
        json.entry.should.have.property('trusts');
        json.entry.fingerprint.should.equal(issuer);
      }
    });
  };

  this.getTHT = function(comment, leavesCount, root) {
    if(!this['tht'])
      this['tht'] = 0;
    var index = this['tht']++;
    var obj = this;
    it('expect ' + comment, function () {
      var res = obj.apiRes['/ucg/tht'][index].res;
      var json = JSON.parse(res.text);
      res.should.have.status(200);
      isMerkleNodesResult(json);
      json.leavesCount.should.equal(leavesCount);
      if(root)
        json.levels[0][0].should.equal(root);
      else
        _(json.levels[0]).size().should.equal(0);
    });
  };

  this.fprTHT = function(comment, fpr, statusCode, issuer) {
    if(!this['fprTHT'+fpr])
      this['fprTHT'+fpr] = 0;
    var index = this['fprTHT'+fpr]++;
    var obj = this;
    it(comment+' should '+(statusCode == 200 ? '' : 'not ')+'exist', function () {
      var res = obj.apiRes['/ucg/tht/'+fpr][index].res;
      res.should.have.status(statusCode);
      if(statusCode == 200){
        var json = JSON.parse(res.text);
        json.should.have.property('signature');
        json.should.have.property('entry');
        json.entry.should.have.property('version');
        json.entry.should.have.property('currency');
        json.entry.should.have.property('fingerprint');
        json.entry.should.have.property('hosters');
        json.entry.should.have.property('trusts');
        json.entry.fingerprint.should.equal(issuer);
      }
    });
  };

  this.postPeering = function(comment, statusCode, issuer) {
    if(!this['peeringPeers'])
      this['peeringPeers'] = 0;
    var index = this['peeringPeers']++;
    var obj = this;
    it(comment+' should '+(statusCode == 200 ? '' : 'not ')+'exist', function () {
      var res = obj.apiRes['/ucg/peering/peers'][index].res;
      res.should.have.status(statusCode);
      if(statusCode == 200){
        var json = JSON.parse(res.text);
        json.should.have.property('version');
        json.should.have.property('currency');
        json.should.have.property('fingerprint');
        json.should.have.property('dns');
        json.should.have.property('ipv4');
        json.should.have.property('ipv6');
        json.should.have.property('port');
        json.fingerprint.should.equal(issuer);
      }
    });
  };

  this.getPeering = function(comment, leavesCount, root) {
    if(!this['peeringPeers'])
      this['peeringPeers'] = 0;
    var index = this['peeringPeers']++;
    var obj = this;
    it('expect ' + comment, function () {
      var res = obj.apiRes['/ucg/peering/peers'][index].res;
      var json = JSON.parse(res.text);
      res.should.have.status(200);
      isMerkleNodesResult(json);
      json.leavesCount.should.equal(leavesCount);
      if(root)
        json.levels[0][0].should.equal(root);
      else
        _(json.levels[0]).size().should.equal(0);
    });
  };
  
  return this;
}

function isMerkleNodesResult (json) {
  isMerkleResult(json);
  json.should.have.property('levels');
}

function isMerkleLeavesResult (json) {
  isMerkleResult(json);
  json.should.have.property('leaves');
  _(json.leaves).each(function (leaf) {
    leaf.should.have.property('hash');
    leaf.should.have.property('value');
  });
}

function isMerkleResult (json) {
  json.should.have.property('depth');
  json.should.have.property('nodesCount');
  json.should.have.property('levelsCount');
}

function isPubKey (json) {
  json.should.have.property('signature');
  json.should.have.property('key');
  json.key.should.have.property('email');
  json.key.should.have.property('name');
  json.key.should.have.property('fingerprint');
  json.key.should.have.property('raw');
  json.key.should.not.have.property('_id');
  json.key.raw.should.not.match(/-----/g);
}
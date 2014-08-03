var should   = require('should');
var assert   = require('assert');
var async    = require('async');
var fs       = require('fs');
var openpgp  = require('openpgp');
var base64   = require('../../app/lib/base64');
var jpgp     = require('../../app/lib/jpgp');
var mongoose = require('mongoose');
var Keyblock = mongoose.model('Keyblock', require('../../app/models/keyblock'));

var catPubkeyPackets = "" +
  "xsBNBFHHC/EBCADWTLSN7EGP+n30snndS3ZNcB02foL+0opcS6LK2coPDJLg\n" +
  "2nookeJRHZxF3THmZQrKwZOjiuDBinOc5DWlzIS/gD/RaXwntgPFlGKBlBU+\n" +
  "g255fr28ziSb5Y1lW4N//nUFdPZzoMmPgRj0b17T0UPCoMR8ZZ/Smk5LINbQ\n" +
  "wt+A+LEoxEdEVcq+Tyc0OlEabqO6RFqiKDRiPhGPiCwVQA3yPjb6iCp5gTch\n" +
  "ObCxCnDbxA0Mfj9FmHrGbepNHGXxStO4xT0woCb7y02S1E8K08kOc5Bq9e1Y\n" +
  "j5I/mdaw4Hn/Wp28lZl1mnO1u1z9ZU/rcglhEyaEOTwasheb44QcdGSfABEB\n" +
  "AAHNTUxvTCBDYXQgKHVkaWQyO2M7Q0FUO0xPTDsyMDAwLTA0LTE5O2UrNDMu\n" +
  "NzAtMDc5LjQyOzA7KSA8Y2VtLm1vcmVhdUBnbWFpbC5jb20+wsB9BBMBCAAn\n" +
  "BQJRxwvxAhsDBQkLR5jvBQsJCAcDBRUKCQgLBRYCAwEAAh4BAheAAAoJEOnK\n" +
  "t20ZqGUeZYcH/0ItH4b/O0y7V1Jzc1DZAdn4iDiI7/SF3fN4f6cJCu/SOVb+\n" +
  "ERFIb6JK+HNHdVAcMHKaPW625R0FahHUkcXWkkGmQ6+sLIsVZwVN1oeZtlD1\n" +
  "2cq9A4UJyfJUXkinMKkI8xpdV8J7s5wFRavOS/qaF5beah0Z+IGwQK0nuXxW\n" +
  "pT6UZWbpUfXPQB2Mz2/rpjSWKwO3X4FwwOfDiuZExyH2JPDYshdPcj/x+gnz\n" +
  "YW9XfWCJw3rOK42vtM+aLtUpJO0Jh6X/sj/iqyS4rPB4DVCmEgSXPx1P+kqn\n" +
  "sz3aNTOIujXS8Faz+TC+eNhn+z3SoTl5gBlNNM171fWFr0BR3nIfIu7CwFwE\n" +
  "EAEIAAYFAlOm/AEACgkQJFehWHyg7Zw7KggAnOaLv+/B/szpz+qE61qIVMOB\n" +
  "b77R3AcIJW4excA4yWUQIyzhBH/srvp/9OG5aMHuxj5SpNITPMiPgUcH6IEc\n" +
  "Dao+5IZSFzV9mfeWvRkHPzjFvVPakLheKK8yFjUzyZPYORs6OO67eSCCKfIp\n" +
  "CuCgIFbL9GnBMVUhIxRN12+DkJu9jxDyaEwa0mShRibMWfU/lIBxrWVJIXMN\n" +
  "zIQF/IMr19BBT83mfH6h4e4Tg3yat64zYxAlF81xG8k8oaS8/P4DPAISq6Ua\n" +
  "hMUN3UJwGzk7HdO7wo0F3e5onOinit7RTpg/tAZX+r3VIj8TzZnl4QpCS15A\n" +
  "9r9tAcdC0An1ji4sVQ==\n";

describe('Extracting pubkeys of a keyblock', function(){

  var block = new Keyblock({ publicKeys: [
    {
      "number": 0,
      "fingerprint": "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
      "packets": catPubkeyPackets
    }
  ]});

  it('pubkey should give a 1 key array', function(){
    var pubkeyPackets = block.getPublicKeysPackets();
    assert.equal(pubkeyPackets.length, 1);
    assert.equal(pubkeyPackets[0].getFingerprint().toUpperCase(), 'C73882B64B7E72237A2F460CE9CAB76D19A8651E');
  });

  it('basic pubkey should give a 1 key array', function(){
    var keys = block.getBasicPublicKeys();
    assert.equal(keys.length, 1);
    assert.equal(keys[0].getKeyIds().length, 1);
    assert.equal(keys[0].getKeyIds()[0].toHex().toUpperCase(), 'E9CAB76D19A8651E');
    assert.equal(keys[0].getUserIds().length, 1);
    assert.equal(keys[0].getUserIds()[0], 'LoL Cat (udid2;c;CAT;LOL;2000-04-19;e+43.70-079.42;0;) <cem.moreau@gmail.com>');
    assert.equal(keys[0].isPublic(), true);
    assert.equal(keys[0].isPrivate(), false);
    assert.notEqual(keys[0].getPrimaryUser(), null);
    assert.notEqual(keys[0].getPrimaryUser().user, null);
    assert.equal(keys[0].getPrimaryUser().user.userId.userid, keys[0].getUserIds()[0]);
  });
});

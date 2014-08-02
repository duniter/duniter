var should  = require('should');
var assert  = require('assert');
var async   = require('async');
var fs      = require('fs');
var openpgp = require('openpgp');
var base64  = require('../../app/lib/base64');
var jpgp    = require('../../app/lib/jpgp');

var asciiCatPubkey = fs.readFileSync(__dirname + "/../data/lolcat.pub", 'utf8');

describe('Extracting', function(){

  describe('pubkey packet of Cat\'s certificate', function(){

    var pubkeys, pubkey;

    before(function(done) {

      pubkeys = openpgp.key.readArmored(asciiCatPubkey).keys;
      pubkey = pubkeys[0];
      done();
    });

    it('pubkey should give a 1 key array', function(){
      pubkeys.should.be.an.Array;
      assert.equal(pubkeys.length, 1);
    });

    it('pubkey should give a 8 packets list', function(){
      var packets = pubkey.toPacketlist();
      var binConcat = packets.write();
      var base64result = base64.encode(binConcat);
      assert.equal(base64result, base64packetList);
      assert.equal(packets.length, 8);
    });
  });
});

describe('Recomposing', function(){

  describe('pubkey of Cat\'s certificate', function(){

    it('with base64 encoded should give a 8 packets list', function(){
      var packets = new openpgp.packet.List();
      var base64decoded = base64.decode(base64packetList);
      var base64recoded = base64.encode(base64decoded);
      packets.read(base64decoded);
      assert.equal(base64recoded, base64packetList);
      assert.equal(packets.length, 8);
    });

    it('keep only pubkey, uid and certifications', function(){
      var packets = new openpgp.packet.List();
      var packetsFinal = new openpgp.packet.List();
      var base64decoded = base64.decode(base64packetList);
      var base64recoded = base64.encode(base64decoded);
      packets.read(base64decoded);
      packets = packets.filterByTag(
        openpgp.enums.packet.publicKey,
        openpgp.enums.packet.userid,
        openpgp.enums.packet.signature);
      packets.forEach(function(p){
        if (p.tag == openpgp.enums.packet.signature) {
          var signaturesToKeep = [
            openpgp.enums.signature.cert_generic,
            openpgp.enums.signature.cert_persona,
            openpgp.enums.signature.cert_casual,
            openpgp.enums.signature.cert_positive
          ];
          if (~signaturesToKeep.indexOf(p.signatureType))
            packetsFinal.push(p);
        }
        else packetsFinal.push(p);
      });
      assert.equal(base64recoded, base64packetList);
      assert.equal(packetsFinal.length, 4);
    });

    it('should give same fingerprint', function(){
      var packets = new openpgp.packet.List();
      var base64decoded = base64.decode(base64packetList);
      packets.read(base64decoded);
      var key = new openpgp.key.Key(packets);
      var fingerprint = key.getKeyPacket().getFingerprint().toUpperCase();
      assert.equal("C73882B64B7E72237A2F460CE9CAB76D19A8651E", fingerprint);
    });
  });
});

describe('Extracting', function(){

  describe('signature of Cat\'s membership', function(){

    it('with base64 encoded should give a 8 packets list', function(){
      var clearsigned = jpgp().toClearSign(catMSBody, catMSSignature);
      var clearTextMessage = openpgp.cleartext.readArmored(clearsigned);
      var packets = clearTextMessage.packets;
      assert.equal(packets.length, 1);
    });

    it('encoding/recoding is OK', function(){
      var clearsigned = jpgp().toClearSign(catMSBody, catMSSignature);
      var clearTextMessage = openpgp.cleartext.readArmored(clearsigned);
      var packets = clearTextMessage.packets;
      var base64encoded = base64.encode(packets.write());
      var base64decoded = base64.decode(base64encoded);
      var base64recoded = base64.encode(base64decoded);
      assert.equal(packets.write(), base64decoded);
      assert.equal(base64encoded, base64recoded);
      assert.equal(packets.length, 1);
    });
  });
});

var base64packetList = "" +
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
  "9r9tAcdC0An1ji4sVc7ATQRRxwvxAQgA8BBrErqzgOMMeI7Csyi29vjv1APk\n" +
  "+wdTpLRUbT6dqg+U0lvZ3nBiGcUCfhpguJfHggiXfysedX7JYBM5R7at0J7h\n" +
  "6dNeTHJYlVrEhw0ksWlSMdgZusKc3CJem5B9IO5E3/BxU1IEpeFY1Q9j0ixu\n" +
  "ARFaFLlhMWe5BwGMyoPAXokiZDw7idnCejzXWeorVdoy4tW9dkCw7VWLWTc0\n" +
  "Cszn6N2Wr17cEDQ1wcmYYRxB1PDROTk6rquYTy7HulLRufo5SSSx5HkPJGUW\n" +
  "3OqLjCnfQZ6CB4UTHHtkJW5y2klf1mgLdwmhlPSzcu5S1XQRbnTIK0/7dWmR\n" +
  "6TZa2N9VszqQOQARAQABwsBlBBgBCAAPBQJRxwvxAhsMBQkLR5jvAAoJEOnK\n" +
  "t20ZqGUeDv4H/3nEShKsVDv+ZzuDqxuKy/HeznjuBRddhK4UdLTcgwNYmt8Y\n" +
  "qpe0F/0RMHHg4t4FdjvPWUvhYI3r/G2sv6ZJD11sOp1e//USGRK/Sz4i8nfg\n" +
  "pgYCQVdIKhMTuueQ/BCOgxhVIWR/l7yD1p3Iq+d2r9BI826/4U8vqwebU32e\n" +
  "a6zkRuvTNNUOaZ+irOiS4N8ebmHpiuQWxwwaOsIpa5dKJNoaP0ebcyp5ndMq\n" +
  "9rmKxr+HSHsCLfAnlcmkysU03oFT/Ai3t8zaGw0A7Bob5ZR+CNgSQ65ryA8+\n" +
  "2ktkkk9v/z3Kuz0XsmQuL+iICXlWki2b6GUWkt7VMTuhrqTnd5nZr5XOwE0E\n" +
  "U2PFegEIAMn3MSLQxzi2l58Bpk/Z3Z+fWyFoEqvRPnpAMaiHEFRwGiG7eTQh\n" +
  "0lhxHW3yGzvQafgdMqi4IGGF0oeDBaNjjQtDabnBfRMiotXFpFrA7OiEEdFo\n" +
  "kbYDoMHYd4zADFb739ubiSiYd6G2TlFMJejoJ0+f6NMGuP0pUtJVf74SsR/1\n" +
  "ASdQPVXnTV9PHo4P8oAZMYoTkC6GIWq2L03YN/CRFWgJ8z4vSXOdK/cOW9lh\n" +
  "y4u0mb270OX8HcQaynxPdB2LxNY6EvJTINEYS4UlUjkyb7vo2XtEnQWpQ1KQ\n" +
  "NOckDzNj7JJS0fDEJOUMlQRVUWfVOCuLyJNAD6IRgz9EtKR60LcAEQEAAcLB\n" +
  "fgQYAQgACQUCU2PFegIbAgEpCRDpyrdtGahlHsBdIAQZAQgABgUCU2PFegAK\n" +
  "CRA9GbQLzkDt9faJCACN7k6ZIBoyAgAgXuoB0F46gHGv0b+cCNIChGxP3LQ5\n" +
  "ByvY0btrhAVMdkLm9d5iJKTuS7O4HxKhWaVIQY9/o0Nt8NPGL5nqV6WNpPjv\n" +
  "eNsFfsdHOKwhSGvLXsZCkzyikkFeq6N8P/Tj3yq0V37yQz481RVQugFOafPm\n" +
  "FAstu3gbvIulI26pQDZ7I+1tvqLyRPaY3tTmRO/xsxjxDCJof5gMIU//IFCa\n" +
  "0rBfaieGApCFr9/xIngMY6+D60I83QI5fDqnCAj9GBk4j2gH+8AlNT8Na4S4\n" +
  "oN9ML9/9Zr/p1D+uF3wtkw+0/tdsj4S573DNNSyXzZgkrj237vSopOcBmGae\n" +
  "uh8IAKLhyCw8FWt+4ifwwv5P2SzM7FjA6fMfLSY16dGjYNCe33PjRi4JdwWg\n" +
  "wwimbSjUQo5EWJ6rubVeTIj7wEpvhp3YdMtaimpP8hEnjpq2r+ChFbN90Rjj\n" +
  "/nZc1OPKXaNPoCb3bqD5e8P412RLOWcnok+6PR5k1PE+JyqLNoZwjjR6WaTT\n" +
  "65I0SzzpI9KSuxnNs+T5E/Qz60Z1rDs7cJbuxBQAo8Ye3kGV0UYvofDikxY2\n" +
  "Duhu9y7le2y+RUSCazS3k8U0Ab/YlMb49yJyyt/8R076j0bczbPQvgUXEiSu\n" +
  "aqunJxSx9P+AgyUWj4TKDNBLHCQKv5XYeCEEPFmqavRNjLU=";

var catMSBody = "" + 
  "Version: 1\r\n" +
  "Currency: beta_brousouf\r\n" +
  "Issuer: 405715EC64289D1F43808F57EC51F273CBC0FA17\r\n" +
  "Date: 1406918607\r\n" +
  "Membership: IN\r\n" +
  "UserID: LoL Cat (udid2;c;CAT;LOL;2000-04-19;e+43.70-079.42;0;) <cem.moreau@gmail.com>\r\n";


var catMSSignature = "" + 
  "-----BEGIN PGP SIGNATURE-----\r\n" +
  "Version: GnuPG v1\r\n" +
  "\r\n" +
  "iQEcBAABCAAGBQJT3BgPAAoJED0ZtAvOQO31VGwIAMU+8aMR/9kiJXNAbbKriQeM\r\n" +
  "+K7X+adQWQl3VHeNKhTkGcavGe6v/DhI/f/Kgt2rXaSbzOIoHMqhRtfxWrA/Oo5t\r\n" +
  "fTtkPFW4aGFgcqA0naN8CaRc1yK8zYOEzzZ3lxEh4/DnwBOb+MYVdZXFmTaLuwiM\r\n" +
  "UXc6gCUyTgqddp1875G8K410XRl8/OMs8UkAH52E7MHjd6bm/LsRh1o9d2mnGXMp\r\n" +
  "YX7a81vRJJdzwQNWvtpbvXHGn0NGYysze2zwCls7O38+3M5fRNLr3s8c7dXsn8og\r\n" +
  "CpZ572wX4Wey1vYrJmGQFRxPz9LgGZWiGMF6oGeHfeTTiclXT+zkGE30CSxHaQM=\r\n" +
  "=33P8\r\n" +
  "-----END PGP SIGNATURE-----\r\n";
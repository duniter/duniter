
import { rawTxParseAndVerify, sourceIsUnlockable, txVerify, txsInputsAreUnlockable } from "../../neon/lib";
import * as assert from "assert";
import { TransactionDTOV10 } from "../../neon/native";

let rawTx: string;
//let txV10: TransactionDTOV10;

describe('Transaction tests:', function(){

    before(async () => {
      rawTx = `Version: 10
Type: Transaction
Currency: duniter_unit_test_currency
Blockstamp: 204-00003E2B8A35370BA5A7064598F628A62D4E9EC1936BE8651CE9A85F2E06981B
Locktime: 0
Issuers:
DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV
4tNQ7d9pj2Da5wUVoW9mFn7JjuPoowF977au8DdhEjVR
FD9wujR7KABw88RyKEGBYRLz8PA6jzVCbcBAsrBXBqSa
Inputs:
40:2:T:6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3:2
70:2:T:3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435:8
20:2:D:DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV:46
70:2:T:A0D9B4CDC113ECE1145C5525873821398890AE842F4B318BD076095A23E70956:3
20:2:T:67F2045B5318777CC52CD38B424F3E40DDA823FA0364625F124BABE0030E7B5B:5
15:2:D:FD9wujR7KABw88RyKEGBYRLz8PA6jzVCbcBAsrBXBqSa:46
Unlocks:
0:SIG(0)
1:XHX(7665798292)
2:SIG(0)
3:SIG(0) SIG(2)
4:SIG(0) SIG(1) SIG(2)
5:SIG(2)
Outputs:
120:2:SIG(BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g)
146:2:SIG(DSz4rgncXCytsUMW2JU2yhLquZECD2XpEkpP9gG5HyAx)
49:2:(SIG(6DyGr5LFtFmbaJYRvcs9WmBsr4cbJbJ1EV9zBbqG7A6i) || XHX(3EB4702F2AC2FD3FA4FDC46A4FC05AE8CDEE1A85F2AC2FD3FA4FDC46A4FC01CA))
Comment: -----@@@----- (why not this comment?)
kL59C1izKjcRN429AlKdshwhWbasvyL7sthI757zm1DfZTdTIctDWlKbYeG/tS7QyAgI3gcfrTHPhu1E1lKCBw==
e3LpgB2RZ/E/BCxPJsn+TDDyxGYzrIsMyDt//KhJCjIQD6pNUxr5M5jrq2OwQZgwmz91YcmoQ2XRQAUDpe4BAw==
w69bYgiQxDmCReB0Dugt9BstXlAKnwJkKCdWvCeZ9KnUCv0FJys6klzYk/O/b9t74tYhWZSX0bhETWHiwfpWBw==`;
    })
  
    it('rawTxParseAndVerify', function(done){
        assert.throws(
            () => rawTxParseAndVerify(rawTx),
            "Not same sum of inputs amount and outputs amount: (SourceAmount { amount: 235, base: 2 }, SourceAmount { amount: 315, base: 2 })"
        );
        //const tx = rawTxParseAndVerify(rawTx);
        //assert.equal(tx.hash, "F26C0D9D77952D62085DE5D46A760EC53026D82464D6C9F3F2DAB8953B801934")
        done();
    });

    it('rawTxParseAndVerify2', function(done){
        const tx_ = rawTxParseAndVerify(`Version: 10
Type: Transaction
Currency: duniter_unit_test_currency
Blockstamp: 6-1903D9F03FC7E14494FFD12296382E5EB4798D214B3A2CDE5C1E0D420E040A5C
Locktime: 0
Issuers:
HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd
Inputs:
100:0:D:HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:3
Unlocks:
0:SIG(0)
Outputs:
10:0:SIG(2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc)
90:0:SIG(HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd)
Comment: 
sfGOC9anaIDGjbtHri+SvbD7AiIvhWOcOFu41yP+7R94Y7EvTxtR++Qa4SANihkWMtnpamEn5/KbTqu7tQrDDg==
`);

        assert.equal(tx_.signatures[0], "sfGOC9anaIDGjbtHri+SvbD7AiIvhWOcOFu41yP+7R94Y7EvTxtR++Qa4SANihkWMtnpamEn5/KbTqu7tQrDDg==")
        done();
    });
});
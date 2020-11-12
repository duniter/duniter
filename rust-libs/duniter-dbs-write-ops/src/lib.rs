//  Copyright (C) 2020 Éloïs SANCHEZ.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

#![deny(
    clippy::unwrap_used,
    missing_copy_implementations,
    trivial_casts,
    trivial_numeric_casts,
    unstable_features,
    unused_import_braces
)]

pub mod apply_block;
pub mod bc;
pub mod gva;
pub mod txs_mp;

use std::borrow::Cow;

use dubp::block::prelude::*;
use dubp::common::crypto::hashs::Hash;
use dubp::common::prelude::*;
use dubp::documents::{
    prelude::*, smallvec::SmallVec, transaction::TransactionDocumentTrait,
    transaction::TransactionDocumentV10,
};
use dubp::wallet::prelude::*;
use duniter_dbs::gva_v1::{TxsByIssuerEvent, TxsByRecipientEvent, TxsEvent};
use duniter_dbs::{
    kv_typed::prelude::*, BlockMetaV2, BlockNumberKeyV2, DuniterDbs, GvaV1Db, GvaV1DbReadable,
    GvaV1DbWritable, HashKeyV2, PendingTxDbV2, PubKeyKeyV2, PubKeyValV2, SourceAmountValV2, TxDbV2,
    TxsMpV2Db, TxsMpV2DbReadable, TxsMpV2DbWritable, WalletConditionsV2,
};
use resiter::filter_map::FilterMap;
use resiter::flatten::Flatten;
use resiter::map::Map;
use std::ops::Deref;

pub struct UtxoV10 {
    pub id: UtxoIdV10,
    pub amount: SourceAmount,
    pub script: WalletScriptV10,
    pub written_time: i64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use dubp::{
        documents::transaction::TransactionDocumentV10Stringified,
        documents_parser::prelude::FromStringObject,
    };

    #[test]
    #[ignore]
    fn tmp_apply_block_real() -> KvResult<()> {
        let gva_db = GvaV1Db::<Sled>::open(
            SledConf::default()
                .path("/home/elois/.config/duniter/s2/data/gva_v1_sled")
                .flush_every_ms(None),
        )?;
        /*let txs_mp_db = TxsMpV2Db::<Sled>::open(
            SledConf::default()
                .path("/home/elois/.config/duniter/s2/data/txs_mp_v2_sled")
                .flush_every_ms(None),
        )?;*/

        let txs: Vec<TransactionDocumentV10Stringified> = serde_json::from_str(r#"[
            {
              "version": 10,
              "currency": "g1",
              "comment": ". je me sens plus legere mm si....reste le bon toit a trouver dans un temps record ! Merci pour cet eclairage fort",
              "locktime": 0,
              "signatures": [
                "8t5vo+k5OvkyAd+L+J8g6MLpp/AP0qOQFcJvf+OPMEZaVnHH38YtCigo64unU9aCsb9zZc6UEc78ZrkQ/E2TCg=="
              ],
              "outputs": [
                "5000:0:SIG(5VYg9YHvLQuoky7EPyyk3cEfBUtB1GuAeJ6SiJ6c9wWe)",
                "55:0:SIG(Ceq5Y6W5kjFkPrvcx5oAgugLMTwcEXyWgfn3P85TSj7x)"
              ],
              "inputs": [
                "1011:0:D:Ceq5Y6W5kjFkPrvcx5oAgugLMTwcEXyWgfn3P85TSj7x:296658",
                "1011:0:D:Ceq5Y6W5kjFkPrvcx5oAgugLMTwcEXyWgfn3P85TSj7x:296936",
                "1011:0:D:Ceq5Y6W5kjFkPrvcx5oAgugLMTwcEXyWgfn3P85TSj7x:297211",
                "1011:0:D:Ceq5Y6W5kjFkPrvcx5oAgugLMTwcEXyWgfn3P85TSj7x:297489",
                "1011:0:D:Ceq5Y6W5kjFkPrvcx5oAgugLMTwcEXyWgfn3P85TSj7x:297786"
              ],
              "unlocks": [
                "0:SIG(0)",
                "1:SIG(0)",
                "2:SIG(0)",
                "3:SIG(0)",
                "4:SIG(0)"
              ],
              "blockstamp": "304284-000003F738B9A5FC8F5D04B4B9746FD899B3A49367099BB2796E7EF976DCDABB",
              "blockstampTime": 0,
              "issuers": [
                "Ceq5Y6W5kjFkPrvcx5oAgugLMTwcEXyWgfn3P85TSj7x"
              ],
              "block_number": 0,
              "time": 0
            },
            {
              "version": 10,
              "currency": "g1",
              "comment": "Pour les places de cine et l expedition ..Merci",
              "locktime": 0,
              "signatures": [
                "VhzwAwsCr30XnetveS74QD2kJMYCQ89VZvyUBJM9DP/kd5KBqkF1c1HcKpJdHrfu2oq3JbSEIhEf/aLgnEdSCw=="
              ],
              "outputs": [
                "6000:0:SIG(jUPLL2BgY2QpheWEY3R13edV2Y4tvQMCXjJVM8PGDvyd)",
                "10347:0:SIG(2CWxxkttvkGSUVZdaUZHiksNisDC3wJx32Y2NVAyeHez)"
              ],
              "inputs": [
                "347:0:T:4EA4D01422469ABA380F48A48254EB3F15606C12FE4CFF7E7D6EEB1FD9752DDB:1",
                "16000:0:T:9A4DA56EF5F9B50D612D806BAE0886EB3033B4F166D2E96498DE16B83F39B59D:0"
              ],
              "unlocks": [
                "0:SIG(0)",
                "1:SIG(0)"
              ],
              "blockstamp": "304284-000003F738B9A5FC8F5D04B4B9746FD899B3A49367099BB2796E7EF976DCDABB",
              "blockstampTime": 0,
              "issuers": [
                "2CWxxkttvkGSUVZdaUZHiksNisDC3wJx32Y2NVAyeHez"
              ],
              "block_number": 0,
              "time": 0
            },
            {
              "version": 10,
              "currency": "g1",
              "comment": "POur le sac a tarte merci",
              "locktime": 0,
              "signatures": [
                "721K4f+F9PgksoVDZgQTURJIO/DZUhQfAzXfBvYrFkgqHNNeBbcgGecFX63rPYjFvau+qg1Hmi0coL9z7r7EAQ=="
              ],
              "outputs": [
                "15000:0:SIG(KxyNK1k55PEA8eBjX1K4dLJr35gC2dwMwNFPHwvZFH4)",
                "17668:0:SIG(4VQvVLT1R6upLuRk85A5eWTowqJwvkSMGQQZ9Hc4bqLg)"
              ],
              "inputs": [
                "1011:0:D:4VQvVLT1R6upLuRk85A5eWTowqJwvkSMGQQZ9Hc4bqLg:303924",
                "1011:0:D:4VQvVLT1R6upLuRk85A5eWTowqJwvkSMGQQZ9Hc4bqLg:304212",
                "10458:0:T:55113E18AB61603AD0FC24CD11ACBC96F9583FD0A5877055F17315E9613BBF7D:1",
                "20188:0:T:937A0454C1A63B383FBB6D219B9312B0A36DFE19DA08076BD113F9D5D4FC903D:1"
              ],
              "unlocks": [
                "0:SIG(0)",
                "1:SIG(0)",
                "2:SIG(0)",
                "3:SIG(0)"
              ],
              "blockstamp": "304284-000003F738B9A5FC8F5D04B4B9746FD899B3A49367099BB2796E7EF976DCDABB",
              "blockstampTime": 0,
              "issuers": [
                "4VQvVLT1R6upLuRk85A5eWTowqJwvkSMGQQZ9Hc4bqLg"
              ],
              "block_number": 0,
              "time": 0
            }
          ]"#).expect("wrong tx");

        let block = DubpBlockV10Stringified {
            number: 304286,
            hash: Some(
                "000001339AECF3CAB78B2B61776FB3819B800AB43923F4F8BD0F5AE47B7DEAB9".to_owned(),
            ),
            median_time: 1583862823,
            transactions: txs,
            ..Default::default()
        };
        let block = DubpBlockV10::from_string_object(&block).expect("fail to parse block");

        gva::apply_block(&block, &gva_db)?;

        Ok(())
    }
}

use arrayvec::ArrayVec;
use duniter_core::common::crypto::bases::b58::ToBase58 as _;
use duniter_core::common::crypto::hashs::Hash;
use duniter_core::common::crypto::keys::ed25519::{PublicKey, Signature};
use duniter_core::common::crypto::keys::Signature as _;
use std::convert::TryFrom;

pub fn stringify_json_value(mut json_value: serde_json::Value) -> serde_json::Value {
    match json_value {
        serde_json::Value::Object(ref mut json_obj) => stringify_json_object(json_obj),
        serde_json::Value::Array(ref mut json_array) => {
            for json_array_cell in json_array {
                if let serde_json::Value::Object(json_obj) = json_array_cell {
                    stringify_json_object(json_obj)
                }
            }
        }
        _ => (),
    }

    json_value
}

fn stringify_json_object(json_object: &mut serde_json::Map<String, serde_json::Value>) {
    let mut stringified_values: Vec<(String, serde_json::Value)> = Vec::new();
    for (k, v) in json_object.iter_mut() {
        match k.as_str() {
            "pub" | "pubkey" | "issuer" => {
                if let serde_json::Value::Object(json_pubkey) = v {
                    let json_pubkey_data = json_pubkey.get("datas").expect("corrupted db");
                    if let serde_json::Value::Array(json_array) = json_pubkey_data {
                        let pubkey_string =
                            PublicKey::try_from(&json_array_to_32_bytes(json_array)[..])
                                .expect("corrupted db")
                                .to_base58();
                        stringified_values
                            .push((k.to_owned(), serde_json::Value::String(pubkey_string)));
                    } else {
                        panic!("corrupted db");
                    }
                }
            }
            "hash" | "inner_hash" | "previous_hash" => {
                if let serde_json::Value::Array(json_array) = v {
                    let hash_string = Hash(json_array_to_32_bytes(json_array)).to_hex();
                    stringified_values.push((k.to_owned(), serde_json::Value::String(hash_string)));
                }
            }
            "sig" | "signature" => {
                if let serde_json::Value::Array(json_array) = v {
                    let sig_string = Signature(json_array_to_64_bytes(json_array)).to_base64();
                    stringified_values.push((k.to_owned(), serde_json::Value::String(sig_string)));
                }
            }
            _ => {
                if let serde_json::Value::Object(ref mut json_sub_object) = v {
                    stringify_json_object(json_sub_object)
                }
            }
        }
    }
    for (k, v) in stringified_values {
        json_object.insert(k, v);
    }
}

#[inline]
fn json_array_to_32_bytes(json_array: &[serde_json::Value]) -> [u8; 32] {
    let bytes = json_array
        .iter()
        .map(|jv| {
            if let serde_json::Value::Number(jn) = jv {
                jn.as_u64().unwrap_or_default() as u8
            } else {
                panic!("corrupted db")
            }
        })
        .collect::<ArrayVec<[u8; 32]>>();
    bytes.into_inner().expect("corrupted db")
}

#[inline]
fn json_array_to_64_bytes(json_array: &[serde_json::Value]) -> [u8; 64] {
    let bytes = json_array
        .iter()
        .map(|jv| {
            if let serde_json::Value::Number(jn) = jv {
                jn.as_u64().unwrap_or_default() as u8
            } else {
                panic!("corrupted db")
            }
        })
        .collect::<ArrayVec<[u8; 64]>>();
    bytes.into_inner().expect("corrupted db")
}

#[cfg(test)]
mod tests {
    use super::*;
    use duniter_core::common::crypto::keys::PublicKey as _;
    use serde_json::Number;
    use serde_json::Value;
    use unwrap::unwrap;

    #[derive(serde::Serialize)]
    struct JsonObjectTest {
        pubkey: PublicKey,
        hash: Hash,
        other: usize,
        inner: JsonSubObjectTest,
    }

    #[derive(serde::Serialize)]
    struct JsonSubObjectTest {
        issuer: PublicKey,
    }

    #[test]
    fn test_stringify_json_object() {
        let mut json_value = unwrap!(serde_json::to_value(JsonObjectTest {
            pubkey: unwrap!(PublicKey::from_base58(
                "A2C6cVJnkkT2n4ivMPiLH2njQHeHSZcVf1cSTwZYScQ6"
            )),
            hash: unwrap!(Hash::from_hex(
                "51DF2FCAB8809596253CD98594D0DBCEECAAF3A88A43C6EDD285B6B24FB9D50D"
            )),
            other: 3,
            inner: JsonSubObjectTest {
                issuer: unwrap!(PublicKey::from_base58(
                    "4agK3ycEQNahuRGoFJDXA2aQGt4iV2YSMPKcoMeR6ZfA"
                ))
            }
        }));

        if let serde_json::Value::Object(ref mut json_obj) = json_value {
            stringify_json_object(json_obj);

            assert_eq!(
                json_obj.get("pubkey"),
                Some(Value::String(
                    "A2C6cVJnkkT2n4ivMPiLH2njQHeHSZcVf1cSTwZYScQ6".to_owned()
                ))
                .as_ref()
            );
            assert_eq!(
                json_obj.get("hash"),
                Some(Value::String(
                    "51DF2FCAB8809596253CD98594D0DBCEECAAF3A88A43C6EDD285B6B24FB9D50D".to_owned()
                ))
                .as_ref()
            );
            assert_eq!(
                json_obj.get("other"),
                Some(Value::Number(Number::from(3))).as_ref()
            );

            let json_sub_obj = unwrap!(json_obj.get("inner"));
            if let serde_json::Value::Object(json_sub_obj) = json_sub_obj {
                assert_eq!(
                    json_sub_obj.get("issuer"),
                    Some(Value::String(
                        "4agK3ycEQNahuRGoFJDXA2aQGt4iV2YSMPKcoMeR6ZfA".to_owned()
                    ))
                    .as_ref()
                );
            } else {
                panic!("json_sub_obj must be an abject");
            }
        } else {
            panic!("json_value must be an abject");
        }
    }

    #[test]
    fn test_json_array_to_32_bytes() {
        let json_array = vec![
            Value::Number(Number::from(0)),
            Value::Number(Number::from(1)),
            Value::Number(Number::from(2)),
            Value::Number(Number::from(0)),
            Value::Number(Number::from(1)),
            Value::Number(Number::from(2)),
            Value::Number(Number::from(0)),
            Value::Number(Number::from(1)),
            Value::Number(Number::from(2)),
            Value::Number(Number::from(0)),
            Value::Number(Number::from(1)),
            Value::Number(Number::from(2)),
            Value::Number(Number::from(0)),
            Value::Number(Number::from(1)),
            Value::Number(Number::from(2)),
            Value::Number(Number::from(0)),
            Value::Number(Number::from(1)),
            Value::Number(Number::from(2)),
            Value::Number(Number::from(0)),
            Value::Number(Number::from(1)),
            Value::Number(Number::from(2)),
            Value::Number(Number::from(0)),
            Value::Number(Number::from(1)),
            Value::Number(Number::from(2)),
            Value::Number(Number::from(0)),
            Value::Number(Number::from(1)),
            Value::Number(Number::from(2)),
            Value::Number(Number::from(0)),
            Value::Number(Number::from(1)),
            Value::Number(Number::from(2)),
            Value::Number(Number::from(0)),
            Value::Number(Number::from(1)),
        ];

        assert_eq!(
            [
                0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0,
                1, 2, 0, 1
            ],
            json_array_to_32_bytes(json_array.as_ref()),
        )
    }
}

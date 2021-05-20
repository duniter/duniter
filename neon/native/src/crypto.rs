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

use crate::into_neon_res;
use duniter_core::common::crypto::bases::b58::ToBase58;
use duniter_core::common::crypto::hashs::Hash;
use duniter_core::common::crypto::keys::{
    ed25519::{
        Ed25519KeyPair, KeyPairFromSeed32Generator, PublicKey as Ed25519PublicKey,
        Signator as Ed25519Signator, Signature as Ed25519Signature,
    },
    KeyPair, PublicKey, Signator, Signature,
};
use duniter_core::common::crypto::seeds::Seed32;
use neon::declare_types;
use neon::prelude::*;
use std::ops::Deref;

pub fn generate_random_seed(mut cx: FunctionContext) -> JsResult<JsBuffer> {
    let seed = into_neon_res(
        &mut cx,
        Seed32::random().map_err(|_| "fail to generate random seed"),
    )?;

    let mut js_buffer = JsBuffer::new(&mut cx, 32)?;

    cx.borrow_mut(&mut js_buffer, |data| {
        let slice = data.as_mut_slice::<u8>();
        slice.copy_from_slice(seed.as_ref());
    });

    Ok(js_buffer)
}

pub fn seed_to_expanded_base58_secret_key(mut cx: FunctionContext) -> JsResult<JsString> {
    let seed_js_buffer = cx.argument::<JsBuffer>(0)?;

    let mut seed_bytes = [0u8; 32];
    cx.borrow(&seed_js_buffer, |data| {
        seed_bytes.copy_from_slice(data.as_slice::<u8>());
    });
    let keypair = KeyPairFromSeed32Generator::generate(Seed32::new(seed_bytes));

    let mut expanded_secret_key_bytes = [0u8; 64];
    expanded_secret_key_bytes[0..32].copy_from_slice(seed_bytes.as_ref());
    expanded_secret_key_bytes[32..64].copy_from_slice(&keypair.public_key().as_ref()[..32]);

    let expanded_base58_secret_key = bs58::encode(expanded_secret_key_bytes.as_ref()).into_string();

    Ok(cx.string(expanded_base58_secret_key))
}

pub fn sha256(mut cx: FunctionContext) -> JsResult<JsString> {
    let str_datas = cx.argument::<JsString>(0)?.value();
    Ok(cx.string(Hash::compute(&str_datas.as_bytes()).to_hex().to_uppercase()))
}

pub fn verify(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let message = cx.argument::<JsValue>(0)?;
    let sig_base58 = cx.argument::<JsString>(1)?.value();
    let public_key_base58 = cx.argument::<JsString>(2)?.value();

    match Ed25519Signature::from_base64(&sig_base58) {
        Ok(signature) => match Ed25519PublicKey::from_base58(&public_key_base58) {
            Ok(public_key) => apply_to_js_message(&mut cx, message, |cx, bytes| {
                Ok(cx.boolean(public_key.verify(bytes, &signature).is_ok()))
            }),
            Err(_) => Ok(cx.boolean(false)),
        },
        Err(_) => Ok(cx.boolean(false)),
    }
}

declare_types! {
    pub class JsKeyPair for Ed25519Signator {
        init(mut cx) {
            if let Some(arg0) = cx.argument_opt(0) {
                if arg0.is_a::<JsString>() {
                    let expanded_base58_secret_key = arg0
                        .downcast::<JsString>()
                        .or_throw(&mut cx)?
                        .value();
                        into_neon_res(&mut cx, keypair_from_expanded_base58_secret_key(&expanded_base58_secret_key).map(|kp| kp.generate_signator()))
                } else if arg0.is_a::<JsBuffer>() {
                    let seed_js_buffer = arg0
                        .downcast::<JsBuffer>()
                        .or_throw(&mut cx)?;
                    let mut seed_bytes = [0u8; 32];
                    cx.borrow(&seed_js_buffer, |data| {
                        seed_bytes.copy_from_slice(data.as_slice::<u8>());
                    });
                    let keypair = KeyPairFromSeed32Generator::generate(Seed32::new(seed_bytes));
                    Ok(keypair.generate_signator())
                } else {
                    cx.throw_type_error("arg0 must be a string")
                }
            } else {
                match Ed25519KeyPair::generate_random() {
                    Ok(keypair) => Ok(keypair.generate_signator()),
                    Err(_) => cx.throw_error("fail to generate random keypair"),
                }
            }

        }

        method getPublicKey(mut cx) {
            let this = cx.this();
            let public_key = {
                let guard = cx.lock();
                let keypair = this.borrow(&guard);
                keypair.public_key()
            };

            Ok(cx.string(public_key.to_base58()).upcast())
        }

        method sign(mut cx) {
            let message = cx.argument::<JsValue>(0)?;
            apply_to_js_message(&mut cx, message, |cx, bytes| {
                Ok(sign_bytes(cx, bytes))
            })
        }
    }
}

pub(crate) fn keypair_from_expanded_base58_secret_key(
    expanded_base58_secret_key: &str,
) -> Result<Ed25519KeyPair, &'static str> {
    let bytes = bs58::decode(expanded_base58_secret_key)
        .into_vec()
        .map_err(|_| "fail to decode b58")?;

    let mut seed = [0u8; 32];
    seed.copy_from_slice(&bytes[..32]);
    let mut pubkey_bytes = [0u8; 32];
    pubkey_bytes.copy_from_slice(&bytes[32..64]);

    let keypair = KeyPairFromSeed32Generator::generate(Seed32::new(seed));

    //let expected_pubkey = Ed25519PublicKey::try_from(pubkey_bytes.as_ref());

    if keypair.public_key().as_ref()[..32] == pubkey_bytes {
        Ok(keypair)
    } else {
        Err("corrupted keypair")
    }
}

fn apply_to_js_message<'c, C: Context<'c>, T, F: FnOnce(&mut C, &[u8]) -> NeonResult<T>>(
    cx: &mut C,
    message: Handle<'c, JsValue>,
    f: F,
) -> NeonResult<T> {
    if message.is_a::<JsString>() {
        let message_str = message.downcast::<JsString>().or_throw(cx)?.value();
        f(cx, message_str.as_bytes())
    } else if message.is_a::<JsBuffer>() {
        let js_buffer = message.downcast::<JsBuffer>().or_throw(cx)?;
        let bytes = cx.borrow(&js_buffer, |data| data.as_slice::<u8>());
        f(cx, bytes)
    } else {
        cx.throw_type_error("Message must be a string or buffer")
    }
}

fn sign_bytes<'c>(cx: &mut MethodContext<'c, JsKeyPair>, bytes: &[u8]) -> Handle<'c, JsValue> {
    let this = cx.this();
    let sig = {
        let guard = cx.lock();
        let keypair_box = this.borrow(&guard);
        let keypair: &Ed25519Signator = keypair_box.deref();
        keypair.sign(bytes)
    };

    cx.string(sig.to_base64()).upcast()
}

#[cfg(test)]
mod tests {

    use super::*;
    use unwrap::unwrap;

    #[test]
    fn test_keypair_from_expanded_base58_secret_key() {
        let expanded_base58_secret_key = "51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP";

        let signator = unwrap!(keypair_from_expanded_base58_secret_key(
            expanded_base58_secret_key
        ));

        assert_eq!(
            "HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd",
            signator.public_key().to_base58(),
        )
    }
}

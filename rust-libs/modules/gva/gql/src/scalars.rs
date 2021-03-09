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

use crate::*;
use async_graphql::{InputValueError, InputValueResult, Scalar, ScalarType};
use dubp::crypto::bases::b58::ToBase58;

#[derive(Clone, Copy, Debug)]
pub(crate) struct PubKeyGva(pub(crate) PublicKey);

impl async_graphql::Description for PubKeyGva {
    fn description() -> &'static str {
        "Public key on base 58 representation"
    }
}

#[Scalar(use_type_description = true)]
impl ScalarType for PubKeyGva {
    fn parse(value: async_graphql::Value) -> InputValueResult<Self> {
        if let async_graphql::Value::String(value_str) = &value {
            if value_str.len() < 40 {
                Err(InputValueError::custom("too short public key"))
            } else if value_str.len() > 44 {
                Err(InputValueError::custom("too long public key"))
            } else {
                Ok(PublicKey::from_base58(value_str).map(PubKeyGva)?)
            }
        } else {
            // If the type does not match
            Err(InputValueError::expected_type(value))
        }
    }

    fn to_value(&self) -> async_graphql::Value {
        async_graphql::Value::String(self.0.to_base58())
    }
}

pub(crate) struct PkOrScriptGva(pub(crate) WalletScriptV10);

impl async_graphql::Description for PkOrScriptGva {
    fn description() -> &'static str {
        "Public key on base 58 representation or complex DUBP script"
    }
}

#[Scalar(use_type_description = true)]
impl ScalarType for PkOrScriptGva {
    fn parse(value: async_graphql::Value) -> InputValueResult<Self> {
        if let async_graphql::Value::String(value_str) = &value {
            Ok(PkOrScriptGva(
                if value_str.len() >= 40 || value_str.len() <= 44 {
                    if let Ok(pubkey) = PublicKey::from_base58(&value_str) {
                        WalletScriptV10::single_sig(pubkey)
                    } else {
                        dubp::documents_parser::wallet_script_from_str(&value_str)?
                    }
                } else {
                    dubp::documents_parser::wallet_script_from_str(&value_str)?
                },
            ))
        } else {
            // If the type does not match
            Err(InputValueError::expected_type(value))
        }
    }

    fn to_value(&self) -> async_graphql::Value {
        async_graphql::Value::String(self.0.to_string())
    }
}

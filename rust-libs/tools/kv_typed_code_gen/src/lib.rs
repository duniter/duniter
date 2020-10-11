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

//! Strongly typed key-value storage
//!
//! Macro to generate database code from their schema

mod col_schema;
mod db_readable;
mod db_schema;
mod db_writable;

use inflector::Inflector;
use proc_macro::TokenStream;
use proc_macro2::Group;
use quote::{format_ident, quote};
use syn::{
    parse::{Parse, ParseStream, Result},
    parse_macro_input,
    punctuated::Punctuated,
    Expr, ExprArray, ExprLit, ExprPath, Ident, Lit, LitStr, Token,
};

use crate::col_schema::ColSchema;
use crate::db_readable::impl_db_readable;
use crate::db_schema::DbSchema;
use crate::db_writable::impl_db_writable;

fn ident_to_class_case_string(ident: &Ident) -> String {
    Inflector::to_class_case(&format!("{}", ident))
}
fn ident_to_snake_case_string(ident: &Ident) -> String {
    Inflector::to_snake_case(&format!("{}", ident))
}

#[allow(clippy::let_and_return)]
#[proc_macro]
pub fn db_schema(input: TokenStream) -> TokenStream {
    let db_schema = parse_macro_input!(input as DbSchema);

    let version = db_schema.version;
    let name = ident_to_snake_case_string(&version);
    let collections: Vec<ColSchema> = db_schema
        .collections
        .0
        .into_iter()
        .map(Into::into)
        .collect();

    let db = format_ident!("{}Db", version);
    let db_batch = format_ident!("{}Batch", db);
    let db_ro = format_ident!("{}Ro", db);
    let db_cols_ro = format_ident!("{}ColsRo", db);
    let db_cols_rw = format_ident!("{}ColsRw", db);

    let col_path: Vec<LitStr> = collections.iter().map(|col| col.path.clone()).collect();
    let col_field: Vec<Ident> = collections
        .iter()
        .map(|col| col.name_snake.clone())
        .collect();
    let col_event_type: Vec<Ident> = collections
        .iter()
        .map(|col| format_ident!("{}Event", &col.name_class))
        .collect();
    let col_key_type: Vec<Ident> = collections.iter().map(|col| col.key_ty.clone()).collect();
    let col_name_class: Vec<Ident> = collections
        .iter()
        .map(|col| col.name_class.clone())
        .collect();
    let col_name_class_rw: Vec<Ident> = collections
        .iter()
        .map(|col| format_ident!("{}Rw", &col.name_class))
        .collect();
    let col_value_type: Vec<Ident> = collections.iter().map(|col| col.value_ty.clone()).collect();

    /*let define_each_db_collection: Vec<proc_macro2::TokenStream> =
    collections.iter().map(define_db_collection).collect();*/
    let db_readable = format_ident!("{}Readable", db);
    let impl_db_readable = impl_db_readable(
        &db,
        &db_ro,
        &db_readable,
        &col_name_class,
        &col_field,
        &col_event_type,
        &col_key_type,
        &col_value_type,
    );
    let db_writable = format_ident!("{}Writable", db);
    let impl_db_writable = impl_db_writable(
        &db,
        &db_ro,
        &db_readable,
        &db_writable,
        &col_name_class_rw,
        &col_field,
        &col_path,
        &col_event_type,
    );

    let expanded = quote! {
        pub use __inner::{#db, #db_batch, #db_ro, #db_readable, #db_writable};
        #(
            // Define each collection event type
            #[derive(Debug, PartialEq)]
            pub enum #col_event_type {
                Upsert { key: #col_key_type, value: #col_value_type },
                Remove { key: #col_key_type },
            }
            impl EventTrait for #col_event_type {
                type K = #col_key_type;
                type V = #col_value_type;

                fn upsert(k: Self::K, v: Self::V) -> Self { Self::Upsert { key: k, value: v, } }
                fn remove(k: Self::K) -> Self { Self::Remove { key: k } }
            }
        )*
        // Mocks
        #[cfg(feature = "mock")]
        mockall::mock! {
            pub #db_readable {}

            trait #db_readable {
                type Backend = kv_typed::backend::mock::MockBackend;
                #(type #col_name_class = kv_typed::prelude::MockColRo<#col_event_type>;)*

                #(fn #col_field(&self) -> kv_typed::prelude::MockColRo<#col_event_type>;)*
            }
        }
        // Inner module used to hide internals types that must not be exposed on public api
        mod __inner {
            use super::*;
            // DbCollections
            #[derive(Clone, Debug)]
            pub struct #db_cols_ro<BC: BackendCol> {
                #(#col_field: ColRo<BC, #col_event_type>,)*
            }
            #[derive(Clone, Debug)]
            pub struct #db_cols_rw<BC: BackendCol> {
                #(#col_field: ColRw<BC, #col_event_type>,)*
            }
            impl<BC: BackendCol> #db_cols_rw<BC> {
                fn to_ro(&self) -> #db_cols_ro<BC> {
                    #db_cols_ro {
                        #(#col_field: self.#col_field.to_ro().clone(),)*
                    }
                }
            }
            // Db
            #[derive(Debug)]
            pub struct #db<B: Backend> {
                collections: #db_cols_rw<B::Col>,
            }
            impl<B: Backend> #db<B> {
                pub const NAME: &'static str = #name;
            }
            impl<B: Backend> Clone for #db<B> {
                fn clone(&self) -> Self {
                    #db {
                        collections: self.collections.clone(),
                    }
                }
            }
            #[cfg(feature = "explorer")]
            use kv_typed::prelude::StringErr;
            #[cfg(feature = "explorer")]
            impl<B: Backend> kv_typed::explorer::DbExplorable for #db<B> {
                fn explore<'a>(
                    &self,
                    collection_name: &str,
                    action: kv_typed::explorer::ExplorerAction<'a>,
                    stringify_json_value: fn(serde_json::Value) -> serde_json::Value,
                ) -> KvResult<std::result::Result<kv_typed::explorer::ExplorerActionResponse, StringErr>> {
                    #( if stringify!(#col_field) == collection_name {
                        return action.exec(&self.collections.#col_field, stringify_json_value);
                    } )*
                    Ok(Err(StringErr(format!("collection '{}' not exist in database '{}'.", collection_name, stringify!(#db)))))
                }
                fn list_collections(&self) -> Vec<(&'static str, &'static str, &'static str)> {
                    vec![
                        #((stringify!(#col_field), stringify!(#col_key_type), stringify!(#col_value_type)),)*
                    ]
                }
            }
            pub struct #db_batch<B: Backend> {
                #(#col_field: Batch<B::Col, ColRw<B::Col, #col_event_type>>,)*
            }
            impl<B: Backend> Default for #db_batch<B> {
                fn default() -> Self {
                    #db_batch {
                        #(#col_field: Batch::default(),)*
                    }
                }
            }
            impl<B: Backend> #db_batch<B> {
                #(pub fn #col_field(&mut self) -> &mut Batch<B::Col, ColRw<B::Col, #col_event_type>> { &mut self.#col_field })*
            }
            // DbRo
            #[derive(Debug)]
            pub struct #db_ro<B: Backend> {
                collections: #db_cols_ro<B::Col>,
            }
            impl<B: Backend> #db_ro<B> {
                pub const NAME: &'static str = #name;
            }
            impl<B: Backend> Clone for #db_ro<B> {
                fn clone(&self) -> Self {
                    #db_ro {
                        collections: self.collections.clone(),
                    }
                }
            }
            // Read operations
            #impl_db_readable
            // Write operations
            #impl_db_writable
        }
    };

    //let tokens = TokenStream::from(expanded);
    //eprintln!("TOKENS: {:#}", tokens);

    TokenStream::from(expanded)
}

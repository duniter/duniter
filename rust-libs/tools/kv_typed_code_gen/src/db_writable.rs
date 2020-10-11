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

#[allow(clippy::too_many_arguments)]
pub(crate) fn impl_db_writable(
    db: &Ident,
    db_ro: &Ident,
    db_readable: &Ident,
    db_writable: &Ident,
    col_name_class: &[Ident],
    col_field: &[Ident],
    col_path: &[LitStr],
    col_event_type: &[Ident],
) -> proc_macro2::TokenStream {
    let db_batch = format_ident!("{}Batch", db);
    let db_cols_rw = format_ident!("{}ColsRw", db);
    let col_method_rw: Vec<Ident> = col_field
        .iter()
        .map(|field_name| format_ident!("{}_write", field_name))
        .collect();
    quote! {
        pub trait #db_writable: #db_readable {
            type Backend: Backend;
            type Batch;
            #(type #col_name_class: DbCollectionRw;)*
            type DbRo: Sized;

            fn get_ro_handler(&self) -> Self::DbRo;
            fn open(
                backend_conf: <<Self as #db_writable>::Backend as kv_typed::backend::Backend>::Conf,
            ) -> KvResult <Self>;
            fn new_batch(&self) -> Self::Batch;
            fn write_batch(&self, batch: Self::Batch) -> KvResult<()>;
            #(fn #col_method_rw(&self) -> &Self::#col_name_class;)*
        }
        impl<B: Backend> #db_writable for #db<B> {
            type Backend = B;
            type Batch = #db_batch<B>;
            #(type #col_name_class = ColRw<B::Col, #col_event_type>;)*
            type DbRo = #db_ro<B>;

            #[inline(always)]
            fn get_ro_handler(&self) -> Self::DbRo {
                #db_ro {
                    collections: self.collections.to_ro(),
                }
            }
            #[inline(always)]
            fn new_batch(&self) -> Self::Batch {
                <#db_batch::<B>>::default()
            }
            fn write_batch(&self, batch: Self::Batch) -> KvResult<()> {
                #(self.collections.#col_field.write_batch(batch.#col_field)?;)*
                Ok(())
            }
            fn open(
                backend_conf: <<Self as #db_writable>::Backend as kv_typed::backend::Backend>::Conf,
            ) -> KvResult <Self> {
                let mut db = B::open(&backend_conf)?;
                Ok(#db {
                    collections: #db_cols_rw {
                        #(#col_field: <ColRw<B::Col, #col_event_type>>::new(
                            db.open_col(&backend_conf, #col_path)?
                        ),)*
                    },
                })
            }
            #(fn #col_method_rw(&self) -> &ColRw<B::Col, #col_event_type> { &self.collections.#col_field })*
        }
    }
}

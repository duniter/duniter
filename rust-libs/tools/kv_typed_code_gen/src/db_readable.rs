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
pub(crate) fn impl_db_readable(
    db: &Ident,
    db_ro: &Ident,
    db_readable: &Ident,
    col_name_class: &[Ident],
    col_field: &[Ident],
    col_event_type: &[Ident],
    col_key_type: &[Ident],
    col_value_type: &[Ident],
) -> proc_macro2::TokenStream {
    quote! {
        pub trait #db_readable: Sized {
            type Backend: Backend;
            #(type #col_name_class: DbCollectionRo<Event=#col_event_type, K=#col_key_type, V=#col_value_type>;)*

            #(fn #col_field(&self) -> Self::#col_name_class;)*
        }
        impl<B: Backend> #db_readable for #db<B> {
            type Backend = B;
            #(type #col_name_class = ColRo<B::Col, #col_event_type>;)*

            #(fn #col_field(&self) -> Self::#col_name_class { self.collections.#col_field.to_ro().clone() })*
        }
        impl<B: Backend> #db_readable for #db_ro<B>{
            type Backend = B;
            #(type #col_name_class = ColRo<B::Col, #col_event_type>;)*

            #(fn #col_field(&self) -> Self::#col_name_class { self.collections.#col_field.clone() })*
        }
    }
}

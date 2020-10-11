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

pub(crate) struct ColSchema {
    pub(crate) name_class: Ident,
    pub(crate) name_snake: Ident,
    pub(crate) path: LitStr,
    pub(crate) key_ty: Ident,
    pub(crate) value_ty: Ident,
}

impl From<ExprArray> for ColSchema {
    fn from(expr_array: ExprArray) -> Self {
        let mut expr_iter = expr_array.elems.into_iter();

        let col_path = if let Some(Expr::Lit(ExprLit { lit, .. })) = expr_iter.next() {
            if let Lit::Str(lit_str) = lit {
                lit_str
            } else {
                panic!("Collection must be defined by array of one literal followed by three identifiers");
            }
        } else {
            panic!(
                "Collection must be defined by array of one literal followed by three identifiers"
            );
        };
        let col_name = if let Some(Expr::Path(ExprPath { path, .. })) = expr_iter.next() {
            path.get_ident()
                .expect("Collection name must be a plain identifier")
                .to_owned()
        } else {
            panic!(
                "Collection must be defined by array of one literal followed by three identifiers"
            );
        };
        let key_ty = if let Some(Expr::Path(ExprPath { path, .. })) = expr_iter.next() {
            path.get_ident()
                .expect("Collection key type must be a plain identifier")
                .to_owned()
        } else {
            panic!(
                "Collection must be defined by array of one literal followed by three identifiers"
            );
        };
        let value_ty = if let Some(Expr::Path(ExprPath { path, .. })) = expr_iter.next() {
            path.get_ident()
                .expect("Collection value type must be a plain identifier")
                .to_owned()
        } else {
            panic!(
                "Collection must be defined by array of one literal followed by three identifiers"
            );
        };
        if expr_iter.next().is_some() {
            panic!(
                "Collection must be defined by array of one literal followed by three identifiers"
            );
        }
        ColSchema {
            path: col_path,
            name_class: format_ident!("{}", ident_to_class_case_string(&col_name)),
            name_snake: format_ident!("{}", ident_to_snake_case_string(&col_name)),
            key_ty,
            value_ty,
        }
    }
}

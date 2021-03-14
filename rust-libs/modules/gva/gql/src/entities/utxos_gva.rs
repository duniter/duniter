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

pub(crate) struct UtxosGva(pub arrayvec::ArrayVec<[UtxoGva; 40]>);
impl async_graphql::Type for UtxosGva {
    fn type_name() -> Cow<'static, str> {
        Cow::Owned(format!("[{}]", UtxoGva::qualified_type_name()))
    }

    fn qualified_type_name() -> String {
        format!("[{}]!", UtxoGva::qualified_type_name())
    }

    fn create_type_info(registry: &mut async_graphql::registry::Registry) -> String {
        UtxoGva::create_type_info(registry);
        Self::qualified_type_name()
    }
}
#[async_trait::async_trait]
impl async_graphql::OutputType for UtxosGva {
    async fn resolve(
        &self,
        ctx: &async_graphql::ContextSelectionSet<'_>,
        field: &async_graphql::Positioned<async_graphql::parser::types::Field>,
    ) -> async_graphql::ServerResult<async_graphql::Value> {
        async_graphql::resolver_utils::resolve_list(ctx, field, &self.0, Some(self.0.len())).await
    }
}

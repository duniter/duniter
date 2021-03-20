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

pub(super) async fn exec_req_members_count(
    bca_executor: &BcaExecutor,
) -> Result<BcaRespTypeV0, ExecReqTypeError> {
    if let Some(members_count) = bca_executor
        .cm_accessor
        .get_current_meta(|cm| cm.current_block_meta.members_count)
        .await
    {
        Ok(BcaRespTypeV0::MembersCount(members_count))
    } else {
        Err("no blockchain".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::*;

    #[tokio::test]
    async fn test_exec_req_members_count() {
        let mut cm_mock = MockAsyncAccessor::new();
        cm_mock
            .expect_get_current_meta::<u64>()
            .times(1)
            .returning(|f| Some(f(&CurrentMeta::default())));
        let dbs_reader = MockDbsReader::new();
        let bca_executor =
            create_bca_executor(cm_mock, dbs_reader).expect("fail to create bca executor");

        let resp_res = exec_req_members_count(&bca_executor).await;

        assert_eq!(resp_res, Ok(BcaRespTypeV0::MembersCount(0)));
    }
}

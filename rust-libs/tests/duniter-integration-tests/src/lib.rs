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
    missing_copy_implementations,
    trivial_casts,
    trivial_numeric_casts,
    unstable_features,
    unused_import_braces
)]

#[cfg(test)]
mod tests {
    use dubp::documents::transaction::TransactionDocumentV10Builder;
    use dubp::{
        common::prelude::*,
        crypto::keys::ed25519::{Ed25519KeyPair, PublicKey},
        documents::prelude::*,
        documents::smallvec::smallvec,
    };
    use duniter_server::*;

    #[test]
    fn test_txs_history() -> anyhow::Result<()> {
        std::env::set_var("DUNITER_MODE", "start");
        let server = DuniterServer::start(
            DuniterConf {
                gva: None,
                self_key_pair: Ed25519KeyPair::generate_random()
                    .expect("fail to gen random keypair"),
                txs_mempool_size: 200,
            },
            "currency_test".to_owned(),
            DuniterMode::Start,
            None,
            "test",
        )?;

        let tx = TransactionDocumentV10Builder {
            currency: "duniter_unit_test_currency",
            blockstamp: Blockstamp::default(),
            locktime: 0,
            issuers: smallvec![PublicKey::default()],
            inputs: &[],
            unlocks: &[],
            outputs: smallvec![],
            comment: "test",
            hash: None,
        }
        .build_with_signature(smallvec![]);

        server.add_pending_tx_force(tx.clone())?;

        let txs_history = server.get_transactions_history(PublicKey::default())?;

        tx.get_hash();
        assert_eq!(txs_history.sending, vec![tx]);

        server.remove_all_pending_txs()?;

        assert_eq!(server.get_pending_txs(0, 0)?.len(), 0);

        Ok(())
    }
}

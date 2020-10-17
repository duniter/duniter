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

pub struct GvaWriter {
    txs_mempool_size: usize,
    writer_sender: flume::Sender<DbsWriterMsg>,
}

impl GvaWriter {
    pub fn mock() -> Self {
        Self {
            txs_mempool_size: 0,
            writer_sender: flume::bounded(0).0,
        }
    }
    pub fn new(txs_mempool_size: usize, writer_sender: flume::Sender<DbsWriterMsg>) -> Self {
        Self {
            txs_mempool_size,
            writer_sender,
        }
    }
    pub fn add_pending_tx(&self, tx: TransactionDocumentV10) -> Receiver<KvResult<bool>> {
        let (sender, receiver) = flume::bounded(0);
        let _ = self.writer_sender.send(DbsWriterMsg::AddPendingTx {
            tx,
            max_tx_mp_size_opt: Some(self.txs_mempool_size),
            sender,
        });
        receiver
    }
}

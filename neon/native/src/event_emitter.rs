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

use dubp::documents::prelude::ToStringObject;
use dubp::documents::transaction::TransactionDocumentV10Stringified;
use once_cell::sync::OnceCell;

use super::*;
use std::ops::Deref;

#[derive(Clone)]
pub struct EventEmitter {
    txs_mps_subscriber: Option<duniter_server::TxsMpSubscriber>,
}

static EVENT_EMITTER: OnceCell<EventEmitter> = OnceCell::new();

pub(crate) fn init_event_emitter(txs_mps_subscriber: Option<duniter_server::TxsMpSubscriber>) {
    let _ = EVENT_EMITTER.set(EventEmitter { txs_mps_subscriber });
}

declare_types! {
    pub class JsEventEmitter for EventEmitter {
        init(_cx) {
            Ok(EVENT_EMITTER.get().expect("EVENT_EMITTER is not initialized").clone())
        }
        // This method should be called by JS to receive data. It accepts a
        // `function (err, data)` style asynchronous callback. It may be called
        // in a loop, but care should be taken to only call it once at a time.
        method poll(mut cx) {
            // The callback to be executed when data is available
            let cb = cx.argument::<JsFunction>(0)?;

            // Create an asynchronously `EventEmitterTask` to receive data
            let this = cx.this();
            let task_opt = {
                let guard = cx.lock();
                let event_emitter = this.borrow(&guard);
                if let Some(ref txs_mps_subscriber) = event_emitter.txs_mps_subscriber {
                    Some(EventEmitterTask(txs_mps_subscriber.clone()))
                } else {
                    None
                }
            };

            // Schedule the task on the `libuv` thread pool
            if let Some(task) = task_opt {
                task.schedule(cb);
            }

            // The `poll` method does not return any data.
            Ok(JsUndefined::new().upcast())
        }
    }
}

pub enum Event {
    ReceiveValidTxs {
        txs: duniter_server::smallvec::SmallVec<[TransactionDocumentV10Stringified; 4]>,
    },
}

// Reading from a channel `Receiver` is a blocking operation. This struct
// wraps the data required to perform a read asynchronously from a libuv
// thread.
pub struct EventEmitterTask(pub(crate) duniter_server::TxsMpSubscriber);

// Implementation of a neon `Task` for `EventEmitterTask`. This task reads
// from the events channel and calls a JS callback with the data.
impl Task for EventEmitterTask {
    type Output = Option<Event>;
    type Error = String;
    type JsEvent = JsValue;

    fn perform(&self) -> Result<Self::Output, Self::Error> {
        match self.0.try_recv() {
            Ok(events) => {
                let mut txs = duniter_server::smallvec::SmallVec::new();
                for event in events.deref() {
                    if let duniter_server::TxEvent::Upsert {
                        value: pending_tx, ..
                    } = event
                    {
                        txs.push(pending_tx.0.to_string_object());
                    }
                }
                if txs.is_empty() {
                    Ok(None)
                } else {
                    Ok(Some(Event::ReceiveValidTxs { txs }))
                }
            }
            Err(flume::TryRecvError::Empty) => Ok(None),
            Err(flume::TryRecvError::Disconnected) => Err("Failed to receive event".to_string()),
        }
    }

    fn complete(
        self,
        mut cx: TaskContext<'_>,
        result: Result<Self::Output, Self::Error>,
    ) -> JsResult<Self::JsEvent> {
        // Receive the event or return early with the error
        let event = result.or_else(|err| cx.throw_error(&err))?;

        // Timeout occured, return early with `undefined
        let event = match event {
            Some(event) => event,
            None => return Ok(JsUndefined::new().upcast()),
        };

        // Create an empty object `{}`
        let o = cx.empty_object();

        // Creates an object of the shape `{ "event": string, ...data }`
        match event {
            Event::ReceiveValidTxs { txs } => {
                let event_name = cx.string("txs");
                let event_content = neon_serde::to_value(&mut cx, &txs)?;

                o.set(&mut cx, "event", event_name)?;
                o.set(&mut cx, "data", event_content)?;
            }
        }

        Ok(o.upcast())
    }
}

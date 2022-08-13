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

mod read_from_file;
mod write_in_file;

use duniter_core::wot::{
    data::{
        rusty::RustyWebOfTrust, HasLinkResult, NewLinkResult, RemLinkResult, WebOfTrust, WotId,
    },
    operations::distance::{
        DistanceCalculator, RustyDistanceCalculator, WotDistance, WotDistanceParameters,
    },
    operations::{
        distance::DistanceError,
        path::{PathFinder, RustyPathFinder},
    },
    MAIN_WOT,
};
use neon::declare_types;
use neon::prelude::*;
use parking_lot::RwLock;

pub struct RustWot(Option<RustyWebOfTrust>);

impl RustWot {
    fn get<R, F>(&self, f: F) -> R
    where
        F: FnOnce(&RustyWebOfTrust) -> R,
    {
        if let Some(ref wot) = self.0 {
            f(wot)
        } else if let Some(main_wot) = MAIN_WOT.get() {
            f(&main_wot.read())
        } else {
            panic!("unreachable: get RustWot that is neither main nor non-main!");
        }
    }
    fn get_mut<R, F>(&mut self, f: F) -> R
    where
        F: FnOnce(&mut RustyWebOfTrust) -> R,
    {
        if let Some(ref mut wot) = self.0 {
            f(wot)
        } else if let Some(main_wot) = MAIN_WOT.get() {
            f(&mut main_wot.write())
        } else {
            panic!("unreachable: get RustWot that is neither main nor non-main!");
        }
    }
}

declare_types! {
    pub class JsWoT for RustWot {
        init(mut cx) {
            let arg0 = cx.argument::<JsValue>(0)?;

            if arg0.is_a::<JsNumber>() {
                let max_links = arg0
                .downcast::<JsNumber>()
                .or_throw(&mut cx)?
                .value();
                Ok(RustWot(Some(RustyWebOfTrust::new(max_links as usize))))
            } else if arg0.is_a::<JsString>() {
                let file_path = arg0
                .downcast::<JsString>()
                .or_throw(&mut cx)?
                .value();
                match read_from_file::wot_from_file(file_path) {
                    Ok(wot) => {
                        if std::env::var("DUNITER_JS_TESTS") == Ok("yes".to_owned()) {
                            Ok(RustWot(Some(wot)))
                        } else {
                            MAIN_WOT.set(RwLock::new(wot)).unwrap_or_else(|_| unreachable!());
                            Ok(RustWot(None))
                        }
                    },
                    Err(e) => cx.throw_error(e),
                }
            } else if arg0.is_a::<JsArrayBuffer>() {
                let js_buffer = arg0
                .downcast::<JsArrayBuffer>()
                .or_throw(&mut cx)?;

                let bytes = cx.borrow(&js_buffer, |data| {
                    let slice = data.as_slice::<u8>();
                    Vec::from(slice)
                });

                match bincode::deserialize(&bytes) {
                    Ok(wot) => Ok(RustWot(Some(wot))),
                    Err(e) => cx.throw_error(e.to_string()),
                }
            } else {
                panic!("Expected file path or max links.");
            }
        }

        method clear(mut cx) {
            let mut this = cx.this();
            {
                let guard = cx.lock();
                let mut wot = this.borrow_mut(&guard);
                wot.get_mut(|wot| wot.clear());
            }

            Ok(cx.undefined().upcast())
        }

        method getMaxCert(mut cx) {
            let this = cx.this();
            let max_link = {
                let guard = cx.lock();
                let wot = this.borrow(&guard);
                wot.get(|wot| wot.get_max_link())
            };
            Ok(cx.number(max_link as f64).upcast())
        }

        method setMaxCert(mut cx) {
            let max_links = cx.argument::<JsNumber>(0)?.value() as usize;
            let mut this = cx.this();
            {
                let guard = cx.lock();
                let mut wot = this.borrow_mut(&guard);
                wot.get_mut(|wot| wot.set_max_link(max_links));
            }
            Ok(cx.undefined().upcast())
        }

        method addNode(mut cx) {
            let mut this = cx.this();
            let wot_id = {
                let guard = cx.lock();
                let mut wot = this.borrow_mut(&guard);
                wot.get_mut(|wot| wot.add_node())
            };
            Ok(cx.number(wot_id.0 as f64).upcast())
        }

        method removeNode(mut cx) {
            let mut this = cx.this();
            let wot_id_opt = {
                let guard = cx.lock();
                let mut wot = this.borrow_mut(&guard);
                wot.get_mut(|wot| wot.rem_node())
            };

            if let Some(wot_id) = wot_id_opt {
                Ok(cx.number(wot_id.0 as f64).upcast())
            } else {
                cx.throw_error("empty wot")
            }
        }

        method getWoTSize(mut cx) {
            let this = cx.this();
            let wot_size = {
                let guard = cx.lock();
                let wot = this.borrow(&guard);
                wot.get(|wot| wot.size())
            };
            Ok(cx.number(wot_size as f64).upcast())
        }

        method isEnabled(mut cx) {
            let wot_id = WotId(cx.argument::<JsNumber>(0)?.value() as usize);
            let this = cx.this();
            let is_enabled_opt = {
                let guard = cx.lock();
                let wot = this.borrow(&guard);
                wot.get(|wot| wot.is_enabled(wot_id))
            };

            if let Some(is_enabled) = is_enabled_opt {
                Ok(cx.boolean(is_enabled).upcast())
            } else {
                cx.throw_error(format!("node '{}' not exist.", wot_id.0))
            }
        }

        method getEnabled(mut cx) {
            let this = cx.this();
            let enabled = {
                let guard = cx.lock();
                let wot = this.borrow(&guard);
                wot.get(|wot| wot.get_enabled())
            };

            vec_wot_id_to_js_array(cx, enabled)
        }

        method setEnabled(mut cx) {
            let enabled = cx.argument::<JsBoolean>(0)?.value();
            let wot_id = WotId(cx.argument::<JsNumber>(1)?.value() as usize);

            let mut this = cx.this();
            let enabled_opt = {
                let guard = cx.lock();
                let mut wot = this.borrow_mut(&guard);
                wot.get_mut(|wot| wot.set_enabled(wot_id, enabled))
            };

            if let Some(enabled) = enabled_opt {
                Ok(cx.boolean(enabled).upcast())
            } else {
                cx.throw_error(format!("node '{}' not exist.", wot_id.0))
            }
        }

        method getDisabled(mut cx) {
            let this = cx.this();
            let disabled = {
                let guard = cx.lock();
                let wot = this.borrow(&guard);
                wot.get(|wot| wot.get_disabled())
            };

            vec_wot_id_to_js_array(cx, disabled)
        }

        method getSentries(mut cx) {
            let sentry_requirement = cx.argument::<JsNumber>(0)?.value();
            let this = cx.this();
            let sentries = {
                let guard = cx.lock();
                let wot = this.borrow(&guard);
                wot.get(|wot| wot.get_sentries(sentry_requirement as usize))
            };

            vec_wot_id_to_js_array(cx, sentries)
        }

        method getNonSentries(mut cx) {
            let sentry_requirement = cx.argument::<JsNumber>(0)?.value();
            let this = cx.this();
            let non_sentries = {
                let guard = cx.lock();
                let wot = this.borrow(&guard);
                wot.get(|wot| wot.get_non_sentries(sentry_requirement as usize))
            };

            vec_wot_id_to_js_array(cx, non_sentries)
        }

        method addLink(mut cx) {
            let source = WotId(cx.argument::<JsNumber>(0)?.value() as usize);
            let target = WotId(cx.argument::<JsNumber>(1)?.value() as usize);

            let mut this = cx.this();
            let new_link_result = {
                let guard = cx.lock();
                let mut wot = this.borrow_mut(&guard);
                wot.get_mut(|wot| wot.add_link(source, target))
            };

            match new_link_result {
                NewLinkResult::Ok(count_target_received_certs) |
                    NewLinkResult::AlreadyExistingCertification(count_target_received_certs) |
                    NewLinkResult::AllCertificationsUsed(count_target_received_certs) =>
                        Ok(cx.number(count_target_received_certs as f64).upcast()),
                NewLinkResult::SelfLinkingForbidden() => cx.throw_error( "self linking forbidden"),
                NewLinkResult::UnknownSource() => cx.throw_error(format!("fail to add link {}->{}: unknown source", source.0, target.0)),
                NewLinkResult::UnknownTarget() => cx.throw_error(format!("fail to add link {}->{}: unknown target", source.0, target.0)),
            }
        }

        method existsLink(mut cx) {
            let source = WotId(cx.argument::<JsNumber>(0)?.value() as usize);
            let target = WotId(cx.argument::<JsNumber>(1)?.value() as usize);

            let this = cx.this();
            let has_link_result = {
                let guard = cx.lock();
                let wot = this.borrow(&guard);
                wot.get(|wot| wot.has_link(source, target))
            };

            match has_link_result {
                HasLinkResult::UnknownSource() => cx.throw_error(format!("fail to check link {}->{}: unknown source", source.0, target.0)),
                HasLinkResult::UnknownTarget() => cx.throw_error(format!("fail to check link {}->{}: unknown target", source.0, target.0)),
                HasLinkResult::Link(has_link) => Ok(cx.boolean(has_link).upcast()),
            }
        }

        method removeLink(mut cx) {
            let source = WotId(cx.argument::<JsNumber>(0)?.value() as usize);
            let target = WotId(cx.argument::<JsNumber>(1)?.value() as usize);

            let mut this = cx.this();
            let rem_link_result = {
                let guard = cx.lock();
                let mut wot = this.borrow_mut(&guard);
                wot.get_mut(|wot| wot.rem_link(source, target))
            };

            match rem_link_result {
                RemLinkResult::Removed(count_target_received_certs) |
                RemLinkResult::UnknownCert(count_target_received_certs) =>
                        Ok(cx.number(count_target_received_certs as f64).upcast()),
                RemLinkResult::UnknownSource() => cx.throw_error("unknown source"),
                RemLinkResult::UnknownTarget() => cx.throw_error("unknown target"),
            }
        }

        method isOutdistanced(mut cx) {
            let distance_params = get_distance_params_from_js(&mut cx)?;

            let this = cx.this();
            let distance_res = {
                let guard = cx.lock();
                let wot = this.borrow(&guard);
                wot.get(|wot| RustyDistanceCalculator {}.compute_distance(wot, distance_params))
            };

            match distance_res {
                Ok(distance_data) => Ok(cx.boolean(distance_data.outdistanced).upcast()),
                Err(e) => match e {
                    DistanceError::NodeDontExist(wot_id) => cx.throw_error(format!("node '{}' not exist.", wot_id.0)),
                }
            }
        }

        method detailedDistance(mut cx) {
            let distance_params = get_distance_params_from_js(&mut cx)?;

            let this = cx.this();
            let distance_res = {
                let guard = cx.lock();
                let wot = this.borrow(&guard);
                wot.get(|wot| RustyDistanceCalculator {}.compute_distance(wot, distance_params))
            };

            match distance_res {
                Ok(distance_data) => distance_response_to_js_object(cx, distance_data),
                Err(e) => match e {
                    DistanceError::NodeDontExist(wot_id) => cx.throw_error(format!("node '{}' not exist.", wot_id.0)),
                }
            }
        }

        method getPaths(mut cx) {
            // Get parameters
            let from = WotId(cx.argument::<JsNumber>(0)?.value() as usize);
            let to = WotId(cx.argument::<JsNumber>(1)?.value() as usize);
            let k_max = cx.argument::<JsNumber>(2)?.value() as u32;

            // Call rust PathFinder
            let this = cx.this();
            let paths = {
                let guard = cx.lock();
                let wot = this.borrow(&guard);
                wot.get(|wot| RustyPathFinder {}.find_paths(wot, from, to, k_max))
            };

            // Convert Vec<Vec<WotId>> to JsArray<JsArray<JsNumber>>
            let js_array_paths = JsArray::new(&mut cx, paths.len() as u32);
            for (i, path) in paths.iter().enumerate() {
                let js_array_path = JsArray::new(&mut cx, path.len() as u32);
                for (j, wot_id) in path.iter().enumerate() {
                    let js_number = cx.number(wot_id.0 as f64);
                    js_array_path.set(&mut cx, j as u32, js_number)?;
                }
                js_array_paths.set(&mut cx, i as u32, js_array_path)?;
            }

            Ok(js_array_paths.upcast())
        }

        method toBytes(mut cx) {
            let this = cx.this();
            let ser_res = {
                let guard = cx.lock();
                let wot = this.borrow(&guard);
                wot.get(|wot| bincode::serialize(wot))
            };

            match ser_res {
                Ok(bytes) => {
                    let mut js_buffer = cx.array_buffer(bytes.len() as u32)?;
                    cx.borrow_mut(&mut js_buffer, |data| {
                        data.as_mut_slice::<u8>().copy_from_slice(&bytes)
                    });
                    Ok(js_buffer.upcast())
                },
                Err(e) => cx.throw_error(e.to_string())
            }
        }

        method writeInFile(mut cx) {
            let file_path_str = cx.argument::<JsString>(0)?.value();

            let this = cx.this();
            let res = {
                let guard = cx.lock();
                let wot = this.borrow(&guard);
                wot.get(|wot|  write_in_file::wot_in_file(file_path_str, wot))
            };

            match res {
                Ok(()) => Ok(cx.boolean(true).upcast()),
                Err(e) => cx.throw_error(e),
            }
        }

        method dump(mut cx) {
            let mut dump_wot_chars = Vec::new();

            let this = cx.this();
            let res = {
                let guard = cx.lock();
                let wot = this.borrow(&guard);
                wot.get(|wot| wot.dump(&mut dump_wot_chars))
            };
            match res {
                Ok(()) => match String::from_utf8(dump_wot_chars) {
                    Ok(dump_wot2_str) => Ok(cx.string(dump_wot2_str).upcast()),
                    Err(e) => cx.throw_error(e.to_string()),
                },
                Err(e) => cx.throw_error(e.to_string()),
            }
        }
    }
}

fn vec_wot_id_to_js_array(
    mut cx: MethodContext<JsWoT>,
    vec: Vec<WotId>,
) -> NeonResult<Handle<JsValue>> {
    let js_array = JsArray::new(&mut cx, vec.len() as u32);
    for (i, wot_id) in vec.iter().enumerate() {
        let js_number = cx.number(wot_id.0 as f64);
        js_array.set(&mut cx, i as u32, js_number)?;
    }
    Ok(js_array.upcast())
}

fn get_distance_params_from_js(cx: &mut MethodContext<JsWoT>) -> NeonResult<WotDistanceParameters> {
    Ok(WotDistanceParameters {
        node: WotId(cx.argument::<JsNumber>(0)?.value() as usize),
        sentry_requirement: cx.argument::<JsNumber>(1)?.value() as u32,
        step_max: cx.argument::<JsNumber>(2)?.value() as u32,
        x_percent: cx.argument::<JsNumber>(3)?.value(),
    })
}

fn distance_response_to_js_object(
    mut cx: MethodContext<JsWoT>,
    distance_response: WotDistance,
) -> NeonResult<Handle<JsValue>> {
    let object = JsObject::new(&mut cx);

    let sentries = cx.number(distance_response.sentries as f64);
    let success = cx.number(distance_response.success as f64);
    let success_at_border = cx.number(distance_response.success_at_border as f64);
    let reached = cx.number(distance_response.reached as f64);
    let reached_at_border = cx.number(distance_response.reached_at_border as f64);
    let outdistanced = cx.boolean(distance_response.outdistanced);

    object.set(&mut cx, "nbSentries", sentries)?;
    object.set(&mut cx, "nbSuccess", success)?;
    object.set(&mut cx, "nbSuccessAtBorder", success_at_border)?;
    object.set(&mut cx, "nbReached", reached)?;
    object.set(&mut cx, "nbReachedAtBorder", reached_at_border)?;
    object.set(&mut cx, "isOutdistanced", outdistanced)?;

    Ok(object.upcast())
}

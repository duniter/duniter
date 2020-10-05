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

use std::{
    io::{Error, Write},
    path::PathBuf,
    str::FromStr,
};

use flexi_logger::{
    Cleanup, Criterion, DeferredNow, Duplicate, Level, LogSpecification, Logger, Naming,
    ReconfigurationHandle, Record,
};
use log::{debug, error, info, trace, warn, LevelFilter};
use neon::{declare_types, prelude::*};

pub struct RustLogger(ReconfigurationHandle);

impl Drop for RustLogger {
    fn drop(&mut self) {
        self.0.shutdown();
    }
}

declare_types! {
    pub class JsLogger for RustLogger {
        init(mut cx) {
            let home = cx.argument::<JsString>(0)?.value();
            let level = LevelFilter::from_str(&cx.argument::<JsString>(1)?.value()).unwrap_or(LevelFilter::Info);

            let logger = Logger::with(
                LogSpecification::default(level)
                    .finalize(),
            )
            .format(log_format)
            .log_to_file()
            .append()
            .directory(&home)
            .discriminant("duniter")
            .rotate(
                Criterion::Size(10_000_000),
                Naming::Numbers,
                Cleanup::KeepLogAndCompressedFiles(3, 7),
            )
            .create_symlink(PathBuf::from(home).join("duniter.log"));

            let res = if std::env::var_os("DUNITER_LOG_STDOUT") == Some("no".into()) {
                logger.start()
            } else {
                logger.duplicate_to_stdout(Duplicate::All).start()
            };

            match res {
                Ok(logger_handle) => Ok(RustLogger(logger_handle)),
                Err(e) => cx.throw_error(format!("Fail to init logger: {}", e)),
            }
        }
        method changeLevel(mut cx) {
            let level = LevelFilter::from_str(&cx.argument::<JsString>(0)?.value()).unwrap_or(LevelFilter::Info);
            let mut this = cx.this();
            {
                let guard = cx.lock();
                let mut logger_handle = this.borrow_mut(&guard);
                logger_handle.0.set_new_spec(LogSpecification::default(level).finalize())
            }

            Ok(cx.undefined().upcast())
        }
        method error(mut cx) {
            let string = cx.argument::<JsString>(0)?.value();
            error!("{}", string);
            Ok(cx.undefined().upcast())
        }
        method warn(mut cx) {
            let string = cx.argument::<JsString>(0)?.value();
            warn!("{}", string);
            Ok(cx.undefined().upcast())
        }
        method info(mut cx) {
            let string = cx.argument::<JsString>(0)?.value();
            info!("{}", string);
            Ok(cx.undefined().upcast())
        }
        method debug(mut cx) {
            let string = cx.argument::<JsString>(0)?.value();
            debug!("{}", string);
            Ok(cx.undefined().upcast())
        }
        method trace(mut cx) {
            let string = cx.argument::<JsString>(0)?.value();
            trace!("{}", string);
            Ok(cx.undefined().upcast())
        }
    }
}

fn log_format(w: &mut dyn Write, now: &mut DeferredNow, record: &Record<'_>) -> Result<(), Error> {
    // 2020-10-04T18:14:11+02:00 - info: text
    let level = match record.level() {
        Level::Error => "[31merror[39m",
        Level::Warn => "[33mwarn[39m",
        Level::Info => "[32minfo[39m",
        Level::Debug => "[36mdebug[39m",
        Level::Trace => "[36mtrace[39m",
    };
    write!(
        w,
        "{} - {}: {}",
        now.now().format("%Y-%m-%dT%H:%M:%S%:z"),
        level,
        &record.args()
    )
}

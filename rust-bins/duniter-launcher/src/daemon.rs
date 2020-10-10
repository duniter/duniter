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

pub fn start(prod: bool, profile_path: &Path, duniter_js_args: &[String]) -> Result<()> {
    let mut duniter_js_command = Command::new(get_node_path()?);
    if prod {
        duniter_js_command.current_dir(DUNITER_JS_CURRENT_DIR);
    }
    let mut child = duniter_js_command
        .args(duniter_js_args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;

    let pid = child.id();

    // Write pid on file
    {
        let mut pid_file = File::create(profile_path.join("app.pid"))?;
        pid_file.write_all(format!("{}\n{}", pid, duniter_js_args.join(" ")).as_bytes())?;
    }

    println!("Duniter daemon launched (pid: {}).", pid);

    let daemon = Daemon::new().umask(0o000).start();

    if let Err(e) = daemon {
        eprintln!("Error, {}", e);
    }

    let status = child.wait().expect("fail to wait child");

    std::process::exit(status.code().unwrap_or_default())
}

pub fn status(profile_path: &Path) -> Result<()> {
    let mut pid_file = File::open(profile_path.join("app.pid"))?;
    let mut pid_file_content = String::new();
    pid_file.read_to_string(&mut pid_file_content)?;
    let mut lines = pid_file_content.split('\n');
    let pid = lines
        .next()
        .expect("corrupted pid file")
        .parse::<i32>()
        .expect("invalid pid");

    match nix::sys::signal::kill(Pid::from_raw(pid), Some(Signal::SIGUSR1)) {
        Ok(()) => {
            println!("Duniter is running using PID {}.", pid);
            Ok(())
        }
        Err(Error::Sys(Errno::ESRCH)) => {
            println!("Duniter is not running.");
            std::process::exit(EXIT_CODE_DUNITER_NOT_RUNNING);
        }
        Err(e) => Err(e.into()),
    }
}

pub fn stop(profile_path: &Path) -> Result<Vec<String>> {
    let mut pid_file = File::open(profile_path.join("app.pid"))?;
    let mut pid_file_content = String::new();
    pid_file.read_to_string(&mut pid_file_content)?;
    let mut lines = pid_file_content.split('\n');
    let pid = lines
        .next()
        .expect("corrupted pid file")
        .parse::<i32>()
        .expect("invalid pid");
    let duniter_args: Vec<String> = lines
        .next()
        .expect("corrupted pid file")
        .split(' ')
        .map(ToOwned::to_owned)
        .collect();

    match nix::sys::signal::kill(Pid::from_raw(pid), Some(Signal::SIGINT)) {
        Err(Error::Sys(Errno::ESRCH)) => {
            println!("Duniter is not running.");
            Ok(duniter_args)
        }
        Err(e) => Err(e.into()),
        Ok(()) => {
            println!("Stopping Duniter daemon …");
            loop {
                match nix::sys::signal::kill(Pid::from_raw(pid), Some(Signal::SIGUSR1)) {
                    Ok(()) => {
                        std::thread::sleep(std::time::Duration::from_secs(1));
                        continue;
                    }
                    Err(Error::Sys(Errno::ESRCH)) => {
                        println!("Duniter daemon stopped.");
                        return Ok(duniter_args);
                    }
                    Err(e) => return Err(e.into()),
                }
            }
        }
    }
}

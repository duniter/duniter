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

extern crate structopt;

include!("src/cli.rs");

use std::env;
use structopt::clap::Shell;

fn main() {
    // Define out dir
    let current_dir = match env::current_dir() {
        Err(_e) => return,
        Ok(current_dir) => current_dir,
    };
    let out_dir = current_dir.as_path().join(format!(
        "../../target/{}",
        env::var("PROFILE").unwrap_or_else(|_| "debug".to_owned())
    ));

    // Define shell
    let shell = if let Some(shell_str) = option_env!("COMPLETION_SHELL") {
        Shell::from_str(shell_str).expect("Unknown shell")
    } else {
        Shell::Bash
    };

    let mut app = Opt::clap();
    app.gen_completions(
        "dex", // We need to specify the bin name manually
        shell, // Then say which shell to build completions for
        out_dir,
    ); // Then say where write the completions to
}

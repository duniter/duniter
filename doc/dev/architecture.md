# Duniter architecture

Title: Duniter architecture
Order: 1
Date: 2020-05-04
Slug: architecture
Authors: elois

## Two languages : Rust & Typescript

Historically, Duniter was pure javascript and powered by [NodeJs] (with some C/C++ addons).

In the meantime, Duniter has been entirely rewritten in [Typescript].
Typescript] is a typing language which is then "transpiled" into javascript.
At runtime, it is always javascript code that is interpreted by [NodeJs], the [Typescript] code "disappears" at compile time.

Duniter is currently migrating from [Typescript] to [Rust].
This migration is being done gradually via a [NodeJs]<->[Rust] binding provided by [Neon].
The fact of migrating from code to [Rust] is commonly called "oxidation", so we speak of "Duniter's oxidation".

The long-term goal is to oxidize Duniter entirely, but it is a long process that will take several years.

## Two variants: server & desktop

The "server" variant is command line based and the "desktop" variant has a graphical interface in a window.
The "server" variant has a bad name because both variants include a Duniter server.

## Repository architecture

Folders:

- `app/`: Typescript source code.
- `bin/`: Entry point of the application. Currently it's a js script, in the future it will be replaced by a binary crate.
- `doc/`: Documentation (in markdown).
- `gui/`: Home page and icon for the desktop variant.
- `images/`: Duniter logo in different sizes and formats
- `neon/`: Code for binding NodeJs<->Rust
- `release/`: Build scripts of the deliverables and resources for it
- `rust-libs/`: Rust source code
- `test/`: Automated testing of javascript code

If duniter oxidation is completed, the `app/`, `neon/` and `test/` folders will disappear.
The integration tests for each rust crate can be found in the tests subfolder of the crate folder.

[Neon]: https://neon-bindings.com/
[NodeJs]: https://nodejs.org/en/
[Rust]: https://www.rust-lang.org/
[Typescript]: https://www.typescriptlang.org/

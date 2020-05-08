# Duniteroxyde

`duniteroxyde` is a binding for [Duniter] of the [dubp-rs-libs] libraries, a set of libraries to implement the [DUBP] protocol.

[Duniter]: https://duniter.org/en/
[dubp-rs-libs]: https://git.duniter.org/libs/dubp-rs-libs
[DUBP]: https://git.duniter.org/documents/rfcs/-/blob/master/rfc/0010_Duniter_Blockchain_Protocol_V12.md

## How to set up your development environment (or to compile manually)

### Requirements

You'll need nvm and rust:

- [nvm install instructions](https://github.com/nvm-sh/nvm#installing-and-updating)
- [rust install instructions](https://www.rust-lang.org/learn/get-started)

Once these tools are installed, use nvm to install node 10:

    nvm install 10

Finally, before each work session on Duniteroxide, select Node 10:

    nvm use 10

### Compile

WARNING: It takes a long time and consumes high cpu !

Run the following command at the root of the repository:

    npm install

### Test

Run the following command at the root of the repository:

    npm test

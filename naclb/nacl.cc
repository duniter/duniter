#include <node.h>
#include <v8.h>
#include <stdio.h>
#include <stdlib.h>
#include "tweetnacl.h"

typedef unsigned char u8;
typedef unsigned int u32;
typedef unsigned long long u64;
typedef long long i64;
typedef i64 gf[16];

using namespace v8;

/**
* Verify signature using Ed25519 scheme.
*
* arg0 (Uint8Array): clear message to be verified
* arg1 (Uint8Array): signature to check message against
* arg2 (Uint8Array): public key to use for verification
*/
Handle<Value> Verify(const Arguments& args) {
  HandleScope scope;

  // Reading clear message
  Local<Object> msg = args[0]->ToObject();
  u64 mlen = msg->GetIndexedPropertiesExternalArrayDataLength();
  u8* m = static_cast<u8*>(msg->GetIndexedPropertiesExternalArrayData());

  // Reading detached signature
  Local<Object> sig = args[1]->ToObject();
  u64 smlen = sig->GetIndexedPropertiesExternalArrayDataLength();
  const u8* sm = static_cast<u8*>(sig->GetIndexedPropertiesExternalArrayData());

  // Reading public key
  Local<Object> pub = args[2]->ToObject();
  const u8* pubk = static_cast<u8*>(pub->GetIndexedPropertiesExternalArrayData());

  // Verifying authenticity
  int res = crypto_sign_open(m,&mlen,sm,smlen,pubk);
  if (res == 0)
    // Good signature
    return scope.Close(Boolean::New(true));
  else
    // Wrong signature or error
    return scope.Close(Boolean::New(false));  
}

// TODO: Sign

void Init(Handle<Object> exports) {
  exports->Set(String::NewSymbol("verify"),
      FunctionTemplate::New(Verify)->GetFunction());
}

NODE_MODULE(nacl, Init)

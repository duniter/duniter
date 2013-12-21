#!/bin/bash

[[ -z $1 ]] && host='localhost' || host=$1
[[ -z $2 ]] && port='8081' || port=$2
[[ -z $3 ]] && path='' || path=$3
baseURL="http://$host:$port"

ucoind --currency beta_brousouf reset data
ucoind --currency beta_brousouf config --kmanagement ALL

# Public keys
curl --data-urlencode "keytext@$path/snow.pub" --data-urlencode "keysign@$path/snow.pub.asc" "$baseURL/pks/add" >/dev/null 2>/dev/null
curl --data-urlencode "keytext@$path/uchiha.pub" --data-urlencode "keysign@$path/uchiha.pub.asc" "$baseURL/pks/add" >/dev/null 2>/dev/null
curl --data-urlencode "keytext@$path/lolcat.pub" --data-urlencode "keysign@$path/lolcat.pub.asc" "$baseURL/pks/add" >/dev/null 2>/dev/null
curl --data-urlencode "keytext@$path/white.pub" --data-urlencode "keysign@$path/white.pub.asc" "$baseURL/pks/add" >/dev/null 2>/dev/null

# Some THT entries
curl --data-urlencode "entry@$path/tht/cat.entry" --data-urlencode "signature@$path/tht/cat.entry.asc" "$baseURL/ucg/tht" >/dev/null 2>/dev/null
curl --data-urlencode "entry@$path/tht/snow.entry" --data-urlencode "signature@$path/tht/snow.entry.asc" "$baseURL/ucg/tht" >/dev/null 2>/dev/null
curl --data-urlencode "entry@$path/tht/tobi.entry" --data-urlencode "signature@$path/tht/tobi.entry.asc" "$baseURL/ucg/tht" >/dev/null 2>/dev/null

# Votes
curl --data-urlencode "amendment@$path/amendments/BB-AM0-OK" --data-urlencode "signature@$path/votes/BB-AM0/cat.asc" "$baseURL/hdc/amendments/votes" >/dev/null 2>/dev/null
curl --data-urlencode "amendment@$path/amendments/BB-AM0-OK" --data-urlencode "signature@$path/votes/BB-AM0/tobi.asc" "$baseURL/hdc/amendments/votes" >/dev/null 2>/dev/null
curl --data-urlencode "amendment@$path/amendments/BB-AM0-OK" --data-urlencode "signature@$path/votes/BB-AM0/snow.asc" "$baseURL/hdc/amendments/votes" >/dev/null 2>/dev/null
curl --data-urlencode "amendment@$path/amendments/BB-AM1-OK" --data-urlencode "signature@$path/votes/BB-AM1/cat.asc" "$baseURL/hdc/amendments/votes" >/dev/null 2>/dev/null
curl --data-urlencode "amendment@$path/amendments/BB-AM1-OK" --data-urlencode "signature@$path/votes/BB-AM1/tobi.asc" "$baseURL/hdc/amendments/votes" >/dev/null 2>/dev/null
curl --data-urlencode "amendment@$path/amendments/BB-AM1-OK" --data-urlencode "signature@$path/votes/BB-AM1/snow.asc" "$baseURL/hdc/amendments/votes" >/dev/null 2>/dev/null
curl --data-urlencode "amendment@$path/amendments/BB-AM2-OK-VOTED" --data-urlencode "signature@$path/votes/BB-AM2/cat.asc" "$baseURL/hdc/amendments/votes" >/dev/null 2>/dev/null
curl --data-urlencode "amendment@$path/amendments/BB-AM2-OK-VOTED" --data-urlencode "signature@$path/votes/BB-AM2/tobi.asc" "$baseURL/hdc/amendments/votes" >/dev/null 2>/dev/null
curl --data-urlencode "amendment@$path/amendments/BB-AM2-OK-VOTED" --data-urlencode "signature@$path/votes/BB-AM2/snow.asc" "$baseURL/hdc/amendments/votes" >/dev/null 2>/dev/null

# Transactions
curl --data-urlencode "transaction@$path/tx/tobi.issuance" --data-urlencode "signature@$path/tx/tobi.issuance.asc" "$baseURL/hdc/transactions/process" >/dev/null 2>/dev/null
curl --data-urlencode "transaction@$path/tx/tobi.transfert.snow" --data-urlencode "signature@$path/tx/tobi.transfert.snow.asc" "$baseURL/hdc/transactions/process" >/dev/null 2>/dev/null
curl --data-urlencode "transaction@$path/tx/tobi.fusion.7" --data-urlencode "signature@$path/tx/tobi.fusion.7.asc" "$baseURL/hdc/transactions/process" >/dev/null 2>/dev/null
curl --data-urlencode "transaction@$path/tx/tobi.transfert.cat" --data-urlencode "signature@$path/tx/tobi.transfert.cat.asc" "$baseURL/hdc/transactions/process" >/dev/null 2>/dev/null
curl --data-urlencode "transaction@$path/tx/cat.issuance" --data-urlencode "signature@$path/tx/cat.issuance.asc" "$baseURL/hdc/transactions/process" >/dev/null 2>/dev/null

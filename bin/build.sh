#!/usr/bin/env bash

ROOT=${BASH_SOURCE%/*}

rm -rf $ROOT/../dist
mkdir -p $ROOT/../dist
cat $ROOT/../src/Entity.js \
    $ROOT/../src/Repository.js \
    $ROOT/../src/LocalStorage.js \
    $ROOT/../src/LSDManager.js \
    > $ROOT/../dist/LSDManager.js

echo "done."

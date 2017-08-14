#!/usr/bin/env bash

ROOT=${BASH_SOURCE%/*}

echo "(function(window) {"                  > $ROOT/../dist/LSDManager.js
echo "    'use strict';"                   >> $ROOT/../dist/LSDManager.js
echo ""                                    >> $ROOT/../dist/LSDManager.js
cat $ROOT/../src/tools.js                  >> $ROOT/../dist/LSDManager.js
echo -e "\n\n\n"                           >> $ROOT/../dist/LSDManager.js
cat $ROOT/../src/LSDManager.js             >> $ROOT/../dist/LSDManager.js
echo -e "\n\n\n"                           >> $ROOT/../dist/LSDManager.js
cat $ROOT/../src/LocalStorage.js           >> $ROOT/../dist/LSDManager.js
echo -e "\n\n\n"                           >> $ROOT/../dist/LSDManager.js
cat $ROOT/../src/LocalStorageRepository.js >> $ROOT/../dist/LSDManager.js
echo -e "\n\n\n"                           >> $ROOT/../dist/LSDManager.js
cat $ROOT/../src/IndexedDbRepository.js    >> $ROOT/../dist/LSDManager.js
echo -e "\n\n\n"                           >> $ROOT/../dist/LSDManager.js
cat $ROOT/../src/Entity.js                 >> $ROOT/../dist/LSDManager.js

echo "}(window));"                         >> $ROOT/../dist/LSDManager.js

echo "done."

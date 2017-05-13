set ADDON_VERSION=48
set NW_VERSION=0.17.6
set NW_RELEASE=v0.17.6
set NW=nwjs-%NW_RELEASE%-win-x64
set NW_GZ=%NW%.zip
echo %NW%
echo %NW_GZ%
echo %NW_RELEASE%
node -v

REM NPM
set PATH="C:\Users\vagrant\AppData\Roaming\npm";%PATH%
REM InnoSetup
set PATH="C:\Program Files (x86)\Inno Setup 5";%PATH%

cd C:\Users\vagrant
echo "Suppression des anciennes sources..."
rd /s /q duniter
rd /s /q duniter_release
rd /s /q %NW%
echo "Clonage de Duniter..."
git clone https://github.com/duniter/duniter.git
cd duniter

for /f "delims=" %%a in ('git rev-list --tags --max-count=1') do @set DUNITER_REV=%%a
for /f "delims=" %%a in ('git describe --tags %DUNITER_REV%') do @set DUNITER_TAG=%%a
echo %DUNITER_TAG%

git checkout %DUNITER_TAG%

call npm install
REM call npm test

echo "Retrait des modules 'dev'..."
call npm prune --production
echo "Ajout du module 1/4..."
call npm install duniter-bma --save --production
echo "Ajout du module 2/4..."
call npm install duniter-crawler --save --production
echo "Ajout du module 3/4..."
call npm install duniter-keypair --save --production
echo "Ajout du module 4/4..."
call npm install duniter-prover --save --production
set SRC=%cd%
echo %SRC%
cd node_modules/wotb
call npm install --build-from-source
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 configure
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 build
copy %cd%\lib\binding\Release\node-webkit-%NW_RELEASE%-win32-x64\wotb.node %cd%\lib\binding\Release\node-v%ADDON_VERSION%-win32-x64\wotb.node /Y
cd ../naclb
call npm install --build-from-source
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 configure
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 build
copy %cd%\lib\binding\Release\node-webkit-%NW_RELEASE%-win32-x64\naclb.node %cd%\lib\binding\Release\node-v%ADDON_VERSION%-win32-x64\naclb.node /Y
cd ../scryptb
call npm install --build-from-source
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 configure
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 build
copy %cd%\lib\binding\Release\node-webkit-%NW_RELEASE%-win32-x64\scryptb.node %cd%\lib\binding\Release\node-v%ADDON_VERSION%-win32-x64\scryptb.node /Y
cd ../sqlite3
call npm install --build-from-source
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 configure
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 build
copy %cd%\lib\binding\node-webkit-%NW_RELEASE%-win32-x64\node_sqlite3.node %cd%\lib\binding\node-v%ADDON_VERSION%-win32-x64\node_sqlite3.node /Y
cd ../heapdump
call nw-gyp --target=%NW_VERSION% --msvs_version=2015 configure
call nw-gyp --target=%NW_VERSION% --msvs_version=2015 build
cd ../..
call npm install duniter-ui --save --production
rd /s /q %cd%\node_modules\duniter-ui\node_modules
cd ..
mkdir duniter_release
call 7z x %NW_GZ%
move %NW% %cd%\duniter_release\nw
mkdir %cd%\duniter_release\sources
xcopy %SRC%\gui\* %cd%\duniter_release\nw\ /s /e
xcopy %SRC%\* %cd%\duniter_release\sources\ /s /e
iscc %cd%\duniter_release\sources\release\arch\windows\duniter.iss /DROOT_PATH=%cd%\duniter_release
move %cd%\duniter_release\Duniter.exe C:\vagrant\duniter-desktop-%DUNITER_TAG%-windows-x64.exe
echo "Build done: binary available at duniter-desktop-%DUNITER_TAG%-windows-x64.exe"

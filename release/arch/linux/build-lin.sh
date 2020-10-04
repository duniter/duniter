#!/bin/bash

if [[ -z "${1}" ]]; then
	echo "Fatal: no version given to build script"
	exit 1
fi
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
	source "$NVM_DIR/nvm.sh"
else
	echo "Fatal: could not load nvm"
	exit 1
fi

# Create description.
# -
# Parameters:
# 1. Initial file name.
# 2. Building type (either “desktop” or “server”).
# 3. Category (OS, distribution).
create_desc() {
	cat >"${1}".desc <<-EOF
	{
	  "version": "${DUNITER_TAG}",
	  "job": "${CI_JOB_ID}",
	  "type": "${2^}",
	  "category": "${3}",
	  "arch": "x64"
	}
	EOF
}

# Desktop specific building phase.
# -
# Parameters:
# 1. Building directory.
build_extra_desktop() {
	mv "${RELEASES}/desktop_/extra/desktop/"* "${1}" || exit 1
}

# Server specific building phase.
# -
# Parameters:
# 1. Building directory.
build_extra_server() {
	mkdir -p "${1}/lib/systemd/system" || exit 1
	mv "${RELEASES}/server_/extra/systemd/duniter.service" "${1}/lib/systemd/system" || exit 1
	mkdir -p "${1}/etc/bash_completion.d/" || exit 1
	mv "${RELEASES}/server_/extra/completion/duniter_js_completion.bash" "${1}/etc/bash_completion.d/duniter_js_completion.bash" || exit 1
}

# Debian package building.
# -
# Parameters:
# 1. Building type (either “desktop” or “server”).
# 2. Debian package name.
build_deb_pack() {
	rm -rf "${RELEASES}/duniter-x64"
	mkdir "${RELEASES}/duniter-x64" || exit 1
	mv "${RELEASES}/${1}_/extra/debian/package/"* "${RELEASES}/duniter-x64" || exit 1
	build_extra_${1} "${RELEASES}/duniter-x64"
	mkdir -p "${RELEASES}/duniter-x64/opt/duniter/" || exit 1
	chmod 755 "${RELEASES}/duniter-x64/DEBIAN/"post* || exit 1
	chmod 755 "${RELEASES}/duniter-x64/DEBIAN/"pre* || exit 1
	sed -i "s/Version:.*/Version:${DUNITER_DEB_VER}/g" "${RELEASES}/duniter-x64/DEBIAN/control" || exit 1

	cd "${RELEASES}/${1}_/"
	rm -rf extra
	zip -yqr "${RELEASES}/duniter-x64/opt/duniter/duniter.zip" * || exit 1

	sed -i "s/Package: .*/Package: ${2}/g" "${RELEASES}/duniter-x64/DEBIAN/control" || exit 1

	cd "${RELEASES}"
	fakeroot dpkg-deb --build duniter-x64 || exit 1
	mv duniter-x64.deb "${BIN}/duniter-${1}-${DUNITER_TAG}-linux-x64.deb" || exit 1
	create_desc "${BIN}/duniter-${1}-${DUNITER_TAG}-linux-x64.deb" "${1}" "Linux (Ubuntu/Debian)"
}

# ------------------------------
# Install tools needed to build
# -----------------------------

NODE_VERSION=10.22.1
NVER="v${NODE_VERSION}"
DUNITER_TAG="v${1}"
DUNITER_DEB_VER=" ${1}"

nvm install ${NVER} || exit 1
nvm use ${NVER} || exit 1
curl https://sh.rustup.rs -sSf | sh -s -- -y
export PATH="$HOME/.cargo/bin:$PATH"

# -----------
# Folders
# -----------

ROOT="${PWD}"
WORK_NAME=work
WORK="${ROOT}/${WORK_NAME}"
DOWNLOADS="${WORK}/downloads"
RELEASES_SUBDIR="releases"
RELEASES="${WORK}/${RELEASES_SUBDIR}"
BIN="${WORK}/bin"

mkdir -p "${DOWNLOADS}" "${RELEASES}" "${BIN}" || exit 1
rm -rf "${BIN}/"*.{deb,tar.gz}{,.desc} # Clean up

# ------------
# Get Node.js
# ------------

cd "${DOWNLOADS}"
cp -r ~/.nvm/versions/node/${NVER}/ node-${NVER}-linux-x64

# -----------
# Releases
# -----------

pushd "${ROOT}"
make -C release ADD_DEBUG=N DEST="${RELEASES_SUBDIR}/duniter" base-gui || exit 1
cp -pr "${RELEASES}/duniter" "${RELEASES}/desktop_" || exit 1
make -C release ADD_DEBUG=N DEST="${RELEASES_SUBDIR}/desktop_" desktop clean || exit 1
cp -pr "${RELEASES}/duniter" "${RELEASES}/server_" || exit 1
make -C release ADD_DEBUG=N DEST="${RELEASES_SUBDIR}/server_" server-gui clean || exit 1
popd

# --------------------------------
# Embed nw.js in desktop version
# --------------------------------

# Embed Node.js to make Duniter modules installable
mkdir -p "${RELEASES}/desktop_release" || exit 1
cp -r "${DOWNLOADS}/node-${NVER}-linux-x64/lib" "${RELEASES}/desktop_release/" || exit 1
cp -r "${DOWNLOADS}/node-${NVER}-linux-x64/include" "${RELEASES}/desktop_release/" || exit 1
cp -r "${DOWNLOADS}/node-${NVER}-linux-x64/bin" "${RELEASES}/desktop_release/" || exit 1
# Add Duniter sources
cp -R "${RELEASES}/desktop_/"* "${RELEASES}/desktop_release/" || exit 1
# Add links for Node.js + NPM
cd "${RELEASES}/desktop_release/bin"
ln -s "../lib/node_modules/npm/bin/npm-cli.js" "./npm" -f || exit 1
cd ..
ln -s "./bin/node" "node" -f || exit 1
ln -s "./bin/npm" "npm" -f || exit 1
rm -rf "${RELEASES}/desktop_"
mv "${RELEASES}/desktop_release" "${RELEASES}/desktop_"

# ---------------------------------
# Embed node.js in server version
# ---------------------------------

cp -r "${DOWNLOADS}/node-${NVER}-linux-x64" "${RELEASES}/server_/node" || exit 1

# ---------------
# Build .tar.gz
# ---------------

cd "${RELEASES}/desktop_"
tar czf "${BIN}/duniter-desktop-${DUNITER_TAG}-linux-x64.tar.gz" * || exit 1
create_desc "${BIN}/duniter-desktop-${DUNITER_TAG}-linux-x64.tar.gz" "Desktop" "Linux (generic)"

# -----------------------
# Build Debian packages
# -----------------------

build_deb_pack desktop duniter-desktop
build_deb_pack server duniter

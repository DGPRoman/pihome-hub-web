#!/usr/bin/env bash
#
# Install a built bundle on the Pi that runs pihome-hub, and make it the one served.
#
# The build happens on a development machine, not here: a Pi Zero has no business
# running npm, and the output is the same either way. Copy dist/ over, then run this
# on the Pi against what you copied.
#
#   npm run build
#   rsync -a --delete dist/ pi:/tmp/pihome-hub-web/
#   ssh pi 'sudo /path/to/deploy/install.sh /tmp/pihome-hub-web'
#
# Each install lands in its own directory and a symlink is flipped to it, which is
# what makes a deployment atomic: nobody's browser ever sees an index.html naming
# assets that have already been deleted. The flip takes effect on the next request,
# so the hub is not restarted — and it must not be, because restarting it drives
# every relay back to its configured initial state, which for a light somebody is
# standing under is not a deployment detail.
#
# Usage: sudo deploy/install.sh <directory holding the build>

set -euo pipefail

INSTALL_ROOT=/opt/pihome-hub-web
RELEASES="$INSTALL_ROOT/releases"
CURRENT="$INSTALL_ROOT/current"
HUB_ENV=/etc/pihome-hub/hub.env
HUB_UNIT=pihome-hub.service
# How many previous bundles to leave in place. Enough to go back one that is known
# to work, and one before it, without collecting every build ever deployed.
KEEP=3
readonly INSTALL_ROOT RELEASES CURRENT HUB_ENV HUB_UNIT KEEP

say() { printf '==> %s\n' "$*"; }
die() {
    printf 'install.sh: %s\n' "$*" >&2
    exit 1
}

# -- Preflight ---------------------------------------------------------------

[[ $EUID -eq 0 ]] || die "run as root: sudo $0 $*"
[[ $# -eq 1 ]] || die "usage: sudo $0 <directory holding the build>"

SOURCE="${1%/}"
readonly SOURCE

[[ -d $SOURCE ]] || die "$SOURCE is not a directory. Point this at what 'npm run build' wrote."
# The same file the hub checks for at startup, checked here so a mistake is caught
# while the previous bundle is still the one being served.
[[ -f $SOURCE/index.html ]] || die "$SOURCE holds no index.html, so it is not a built bundle.
Run 'npm run build' and copy the dist/ directory it wrote."

[[ $SOURCE == "$CURRENT" || $SOURCE == "$RELEASES"/* ]] &&
    die "$SOURCE is inside $INSTALL_ROOT. Stage the build somewhere else — /tmp will do —
so that this never reads from the directory it is replacing."

# -- Install -----------------------------------------------------------------

RELEASE="$RELEASES/$(date -u +%Y%m%dT%H%M%SZ)"
readonly RELEASE
[[ -e $RELEASE ]] && die "$RELEASE already exists — two installs in the same second?"

say "installing the bundle to $RELEASE"
install -d -m 755 "$INSTALL_ROOT" "$RELEASES"
# Copied rather than moved: the staging directory belongs to whoever put it there,
# and a deployment that consumes its own input cannot be retried.
cp -R -- "$SOURCE" "$RELEASE"

# Root-owned and world-readable. The hub runs as its own unprivileged account and
# only ever reads these, so nothing here needs to be writable by the service — a
# bundle the service could rewrite is one a bug in it could rewrite.
chown -R root:root "$RELEASE"
chmod -R a=rX,u+w "$RELEASE"

# -- Make it the one served --------------------------------------------------

# Written beside the target and renamed over it. rename(2) is atomic, so there is no
# instant in which the symlink is missing; 'ln -sfn' would unlink first, and a
# request arriving in that window is a 404 on the front page.
say "pointing $CURRENT at it"
ln -s -- "$RELEASE" "$CURRENT.incoming"
mv -T -- "$CURRENT.incoming" "$CURRENT"

# -- Prune -------------------------------------------------------------------

mapfile -t old < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r | tail -n +$((KEEP + 1)))
if ((${#old[@]})); then
    say "removing ${#old[@]} bundle(s) older than the last $KEEP"
    for release in "${old[@]}"; do
        rm -rf -- "${RELEASES:?}/$release"
    done
fi

# -- Tell the operator what is left to do ------------------------------------

# This script does not edit the hub's environment file. That file belongs to
# pihome-hub, its own installer writes it, and a package that edits another's
# configuration is one that fights it on the next upgrade. Saying precisely what to
# add is more useful than doing it and being wrong.
if [[ -f $HUB_ENV ]] && grep -q "^PIHOME_WEB_ROOT=$CURRENT\$" "$HUB_ENV"; then
    say "the hub already serves $CURRENT — no restart needed, the next request gets the new bundle"
elif [[ -f $HUB_ENV ]] && grep -q '^PIHOME_WEB_ROOT=' "$HUB_ENV"; then
    printf 'install.sh: %s\n' "the bundle is installed, but $HUB_ENV points PIHOME_WEB_ROOT somewhere else:

  $(grep '^PIHOME_WEB_ROOT=' "$HUB_ENV")

Change it to $CURRENT and restart:

  sudo systemctl restart $HUB_UNIT" >&2
    exit 1
else
    say "the bundle is installed. The hub is not serving it yet — add one line to $HUB_ENV:"
    printf '\n  PIHOME_WEB_ROOT=%s\n\nand restart the hub once, to read it:\n\n  sudo systemctl restart %s\n\n' \
        "$CURRENT" "$HUB_UNIT"
    say "later installs need no restart: this script flips the symlink and the hub follows it"
fi

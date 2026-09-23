#!/usr/bin/env bash
#
# Exercise install.sh against a throwaway filesystem.
#
# A deployment script is the one piece of this repository that nothing else tests
# and that fails where nobody is watching — on a Pi, over ssh, with the previous
# bundle already gone. So it is run here for real: real directories, a real symlink
# flip, real pruning, and the states hub.env can be in.
#
# It writes to /opt and /etc, which is why it refuses to run unless it is told the
# filesystem is disposable. In CI that is the runner, which is thrown away after the
# job; locally it wants a container:
#
#   docker run --rm -v "$PWD:/w:ro" -w /w debian:stable-slim \
#       env PIHOME_WEB_DEPLOY_TEST=1 bash deploy/test-install.sh

set -u

[[ ${PIHOME_WEB_DEPLOY_TEST:-} == 1 ]] || {
    cat >&2 <<'MSG'
test-install.sh: this installs into /opt and writes /etc/pihome-hub/hub.env, so it
refuses to run on a filesystem somebody might care about. Run it in a container:

  docker run --rm -v "$PWD:/w:ro" -w /w debian:stable-slim \
      env PIHOME_WEB_DEPLOY_TEST=1 bash deploy/test-install.sh
MSG
    exit 2
}

[[ $EUID -eq 0 ]] || {
    echo "test-install.sh: install.sh requires root, so this does too" >&2
    exit 2
}

SCRIPT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/install.sh"
INSTALL_ROOT=/opt/pihome-hub-web
CURRENT="$INSTALL_ROOT/current"
RELEASES="$INSTALL_ROOT/releases"
HUB_ENV=/etc/pihome-hub/hub.env
readonly SCRIPT INSTALL_ROOT CURRENT RELEASES HUB_ENV

passed=0
failed=0

check() {
    local what=$1 got=$2 want=$3
    if [[ $got == "$want" ]]; then
        passed=$((passed + 1))
        printf 'ok   %s\n' "$what"
    else
        failed=$((failed + 1))
        printf 'FAIL %s\n       want: %s\n       got:  %s\n' "$what" "$want" "$got"
    fi
}

# Whether the output mentions something, reduced to yes/no so a failure prints the
# whole of what was said rather than a boolean nobody can act on.
mentions() {
    case $2 in
    *"$1"*) echo yes ;;
    *) printf 'no. output was: %s' "$2" ;;
    esac
}

# A bundle is an index.html and an asset beside it, which is all install.sh looks at.
stage() {
    local where=$1 marker=$2
    mkdir -p "$where/assets"
    printf '<title>%s</title>' "$marker" >"$where/index.html"
    printf 'console.log(1)' >"$where/assets/app.js"
}

releases_kept() { find "$RELEASES" -mindepth 1 -maxdepth 1 -type d | wc -l; }
newest_release() { find "$RELEASES" -mindepth 1 -maxdepth 1 -type d | sort | tail -1; }
# Each install names its directory by the second, so a test making several has to
# let the clock move between them or the second one is refused as a collision.
install_bundle() {
    sleep 1
    stage "$2" "$3"
    "$SCRIPT" "$2" 2>&1
}

# -- A directory that is not a bundle ----------------------------------------

mkdir -p /tmp/not-a-bundle
output=$("$SCRIPT" /tmp/not-a-bundle 2>&1) && status=0 || status=$?
check "a directory with no index.html is refused" "$status" "1"
check "  and says what to run instead" "$(mentions 'npm run build' "$output")" "yes"
check "  without having created anything" "$([[ -e $INSTALL_ROOT ]] && echo yes || echo no)" "no"

# -- A first install ---------------------------------------------------------

stage /tmp/build-one ONE
output=$("$SCRIPT" /tmp/build-one 2>&1) && status=0 || status=$?
check "a first install succeeds" "$status" "0"
check "  and serves what was staged" "$(cat "$CURRENT/index.html")" "<title>ONE</title>"
check "  root-owned" "$(stat -c '%U:%G' "$CURRENT/index.html")" "root:root"
check "  readable by the service account, writable by nobody but root" \
    "$(stat -c '%a' "$CURRENT/index.html")" "644"
check "  with traversable directories" "$(stat -c '%a' "$CURRENT/assets")" "755"
check "  and prints the line hub.env needs" \
    "$(mentions "PIHOME_WEB_ROOT=$CURRENT" "$output")" "yes"

# -- A second install is a flip, not an overwrite ----------------------------

previous=$(readlink -f "$CURRENT")
install_bundle "" /tmp/build-two TWO >/dev/null
check "a second install flips the symlink" "$(cat "$CURRENT/index.html")" "<title>TWO</title>"
check "  leaving the previous bundle in place to roll back to" \
    "$([[ -f $previous/index.html ]] && cat "$previous/index.html")" "<title>ONE</title>"

# -- Pruning -----------------------------------------------------------------

for marker in THREE FOUR FIVE; do
    install_bundle "" "/tmp/build-$marker" "$marker" >/dev/null
done
check "only the last three bundles are kept" "$(releases_kept)" "3"
check "  the newest being the one served" "$(readlink -f "$CURRENT")" "$(newest_release)"
check "  which is the one just installed" "$(cat "$CURRENT/index.html")" "<title>FIVE</title>"

# -- What it says about hub.env ----------------------------------------------

mkdir -p "$(dirname -- "$HUB_ENV")"
printf 'PIHOME_WEB_ROOT=%s\n' "$CURRENT" >"$HUB_ENV"
output=$(install_bundle "" /tmp/build-six SIX) && status=0 || status=$?
check "with hub.env already pointing here it succeeds" "$status" "0"
check "  and says no restart is needed" "$(mentions 'no restart needed' "$output")" "yes"

printf 'PIHOME_WEB_ROOT=/srv/somewhere-else\n' >"$HUB_ENV"
output=$(install_bundle "" /tmp/build-seven SEVEN) && status=0 || status=$?
check "with hub.env pointing somewhere else it fails" "$status" "1"
check "  quoting the line it found" "$(mentions '/srv/somewhere-else' "$output")" "yes"
check "  having installed the bundle regardless" \
    "$(cat "$CURRENT/index.html")" "<title>SEVEN</title>"

# -- Staging from inside the tree it replaces --------------------------------

output=$("$SCRIPT" "$CURRENT" 2>&1) && status=0 || status=$?
check "staging from inside the install root is refused" "$status" "1"
check "  and the bundle already there is untouched" \
    "$(cat "$CURRENT/index.html")" "<title>SEVEN</title>"

printf '\n%d passed, %d failed\n' "$passed" "$failed"
[[ $failed -eq 0 ]]

#!/usr/bin/env bash
# Switch only prepared releases. User runtime files remain in the shared directory.
set -euo pipefail
live=/opt/image2-cauai
shared=/opt/image2-cauai-shared
service=image2-cauai
if [ "$#" -ne 1 ]; then echo 'Usage: bash tools/image2-release-switch.sh /opt/image2-cauai-release-...|/opt/image2-cauai-rollback-...' >&2; exit 2; fi
target=$(realpath -e -- "$1")
case "$target" in /opt/image2-cauai-release-*|/opt/image2-cauai-rollback-*) ;; *) echo 'Target is not a managed Image2 release.' >&2; exit 2;; esac
test -L "$live"
test -s "$target/.next/BUILD_ID"
test -f "$target/node_modules/next/dist/bin/next"
for name in .env .data outputs; do
 test "$(realpath -e "$target/$name")" = "$(realpath -e "$shared/$name")"
done
old=$(realpath -e "$live")
health() {
 for attempt in $(seq 1 20); do
  if curl --silent --fail --max-time 5 -H 'Host: image2.cauai.fun' http://127.0.0.1:3052/data/image2-case-library.index.json > /dev/null; then
   curl --silent --fail --max-time 10 -H 'Host: image2.cauai.fun' http://127.0.0.1:3052/ > /dev/null
   curl --silent --fail --max-time 10 -H 'Host: image2.cauai.fun' http://127.0.0.1:3052/image2-cases > /dev/null
   return 0
  fi
  sleep 1
 done
 return 1
}
link_target() {
 test ! -e "$live.next"
 sudo -n ln -s "$1" "$live.next"
 sudo -n mv -Tf "$live.next" "$live"
}
recover() {
 trap - ERR
 echo 'Release failed; restoring prior release.' >&2
 link_target "$old"
 sudo -n systemctl restart "$service"
 health || true
 exit 1
}
trap recover ERR
link_target "$target"
sudo -n systemctl restart "$service"
health
trap - ERR
printf 'active-release=%s\nbuild-id=%s\n' "$target" "$(cat "$target/.next/BUILD_ID")"
systemctl is-active "$service"
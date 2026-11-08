#!/usr/bin/env bash
# Mobile e2e helper for this repo. Wraps the global rn-e2e-verification scripts
# (~/.agents/skills/rn-e2e-verification) with this app's settings: the dev
# variant, Metro on 8082, and the local web API on 3301 reachable from the Mac.
#
#   e2e.sh up              start the API, Metro and the tunnel to the Mac; wait until the Mac reaches both
#   e2e.sh build android   build the dev APK if native code changed (memory-capped; run in the background)
#   e2e.sh build ios       build the dev .app on the Mac if native code changed
#   e2e.sh devices         list simulators/emulators already booted on the Mac (local: phones on this server's adb)
#   e2e.sh install android install the build, forward 8082 and 3301 to the emulator/phone, print the launch command
#   e2e.sh install ios     install the build on the simulator, print the launch command
#   e2e.sh down            stop what `up` started (API, Metro, tunnel)
#
# Boot the device between `build` and `install` with T3's device_open, after
# checking `devices`: the Mac has 8 GB of RAM, so keep one device booted.
#
# RN_E2E_TARGET=local e2e.sh ...  uses the Android phone on this server's adb
# instead of the Mac (no tunnel; adb reverse maps 8082 and 3301 to this server).
set -euo pipefail

S=${RN_E2E_SCRIPTS:-$HOME/.agents/skills/rn-e2e-verification/scripts}
# shellcheck source=/dev/null
. "$S/env.sh"

APP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
REPO_DIR=$(cd "$APP_DIR/../.." && pwd)
METRO_PORT=8082 # 8081 belongs to another project
API_PORT=3301
API_URL="http://127.0.0.1:$API_PORT" # the Mac's end of the tunnel; adb reverse maps it on Android
WEB_SESSION=productivity-web
METRO_SESSION=rn-metro-$METRO_PORT
TUNNEL_SESSION=rn-tunnel-$METRO_PORT
WEB_LOG=$RN_E2E_LOG_DIR/productivity-web.log
# The Android build gets its own systemd unit with a memory cap. Run inside the
# agent's scope, an out-of-memory kill takes down the whole scope (API, Metro,
# tunnel, browser) along with Gradle. MemoryHigh slows the build down before
# MemoryMax kills it, and stopping the unit also stops the Gradle daemon.
BUILD_MEMORY_HIGH=${E2E_BUILD_MEMORY_HIGH:-9G}
BUILD_MEMORY_MAX=${E2E_BUILD_MEMORY_MAX:-11G}

export APP_VARIANT=development

api_ok() { curl -fs -m3 -o /dev/null "localhost:$API_PORT/"; }
mac_api_ok() { rn_mac "curl -fs -m10 -o /dev/null http://127.0.0.1:$API_PORT/" >/dev/null 2>&1; }

wait_for() { # name timeout-seconds check
	local start=$SECONDS
	until "$3"; do
		((SECONDS - start > $2)) && rn_die "$1: not ready after $2s"
		sleep 2
	done
	rn_log "$1: ready"
}

cmd_up() {
	# API: a local dev server with email kept in Miniflare and links pointing at localhost.
	if rn_has_session "$WEB_SESSION"; then
		rn_log "api: running (tmux -L rn-e2e $WEB_SESSION)"
	elif api_ok; then
		rn_log "api: port $API_PORT already serves something outside this script; using it as is"
	else
		(cd "$REPO_DIR" && pnpm -s db:local:migrate >/dev/null)
		rn_start_session "$WEB_SESSION" "$REPO_DIR" \
			"DEV_REMOTE_BINDINGS=0 VITE_APP_URL=http://localhost:$API_PORT pnpm dev 2>&1 | tee -a $WEB_LOG"
		rn_log "api: started (tmux -L rn-e2e $WEB_SESSION, log $WEB_LOG)"
	fi

	# Metro with the dev variant and the tunnelled API URL. metro-up.sh would
	# start it without them, so start it here under the session name it expects.
	if rn_has_session "$METRO_SESSION"; then
		rn_check_session_path "$METRO_SESSION" "$APP_DIR"
		rn_tmux display-message -p -t "=$METRO_SESSION:" '#{pane_start_command}' | grep -q EXPO_PUBLIC_API_URL ||
			rn_die "$METRO_SESSION runs without this app's env (started by metro-up.sh?). Stop it with 'e2e.sh down' and rerun 'e2e.sh up'."
	else
		rn_start_session "$METRO_SESSION" "$APP_DIR" \
			"EXPO_PUBLIC_API_URL=$API_URL EXPO_PACKAGER_PROXY_URL=http://127.0.0.1:$METRO_PORT npx expo start --port $METRO_PORT 2>&1 | tee -a $RN_E2E_LOG_DIR/metro-$METRO_PORT.log"
	fi

	# One SSH tunnel forwards both Metro and the API to the Mac's 127.0.0.1.
	# A local phone gets both through adb reverse (install) instead.
	if rn_is_local; then
		:
	elif rn_has_session "$TUNNEL_SESSION" && ! mac_api_ok && api_ok; then
		rn_log "tunnel: doesn't forward the API; restarting it"
		rn_tmux kill-session -t "=$TUNNEL_SESSION"
	fi
	if ! rn_is_local && ! rn_has_session "$TUNNEL_SESSION"; then
		rn_start_session "$TUNNEL_SESSION" "$HOME" \
			"ssh -N -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -R $METRO_PORT:localhost:$METRO_PORT -R $API_PORT:localhost:$API_PORT $RN_E2E_MAC 2>&1 | tee -a $RN_E2E_LOG_DIR/tunnel-$METRO_PORT.log"
		sleep 3
		rn_has_session "$TUNNEL_SESSION" || rn_die "the tunnel exited right away; see $RN_E2E_LOG_DIR/tunnel-$METRO_PORT.log"
	fi

	# Waits for Metro on this server and through the Mac.
	"$S/metro-up.sh" --app "$APP_DIR" --port "$METRO_PORT"
	wait_for api 180 api_ok
	rn_is_local || wait_for "api via the Mac" 90 mac_api_ok
	rn_log "web: http://localhost:$API_PORT (the first page load can render blank while Vite optimizes deps; reload)"
}

# The global build.sh copies only the app directory to the Mac, but this app is a pnpm workspace
# member: it needs packages/core, the root package.json (catalog, and the op-sqlite flag the iOS
# podspec reads) and the root lockfile. So this copies the workspace (sources only, ~5 MB),
# installs there and builds apps/mobile. It writes the same ios.app/ios.fingerprint stamps
# install.sh reads, so `e2e.sh install ios` works unchanged.
build_ios() {
	local force=0
	[[ "${1:-}" == "--force" ]] && force=1
	rn_parse_args --app "$APP_DIR" --port "$METRO_PORT"
	rn_load_app_config
	rn_lock "$RN_APP_SLUG-ios"
	local fingerprint dir="~/$RN_APP_MAC_DIR" log="$RN_E2E_LOG_DIR/xcodebuild-$RN_APP_SLUG.log"
	fingerprint=$(rn_fingerprint ios)
	[[ -n "$fingerprint" ]] || rn_die "could not compute the ios fingerprint"
	if ((!force)) && [[ "$(rn_mac "test -d \"\$(cat $dir/ios.app)\" && cat $dir/ios.fingerprint" 2>/dev/null)" == "$fingerprint" ]]; then
		rn_log "ios: build is current ($fingerprint), skipping"
		return
	fi
	local free_kb
	free_kb=$(rn_mac 'df -k ~ | tail -n1' | awk '{print $4}')
	((free_kb > 8 * 1024 * 1024)) || rn_die "only $((free_kb / 1024 / 1024)) GB free on the Mac (need 8); ask the user"

	rn_log "ios: building the workspace on the Mac in $dir (log $log, ~10 min clean)"
	rn_mac "rm -f $dir/ios.fingerprint $dir/ios.app && rm -rf $dir/dd && mkdir -p $dir/src"
	# .env files stay here: Metro on this server inlines env values.
	rsync -a --delete -e 'ssh -o BatchMode=yes' \
		--exclude node_modules --exclude .git --exclude 'apps/mobile/android' --exclude 'apps/mobile/ios' \
		--exclude '.env' --exclude '.env.*' --exclude .dev.vars --exclude .expo --exclude .wrangler --exclude dist \
		"$REPO_DIR/" "$RN_E2E_MAC:$RN_APP_MAC_DIR/src/" >"$log" 2>&1 || rn_die "rsync to the Mac failed; see $log"
	local mac_env="export PATH=\"/opt/homebrew/bin:/usr/local/bin:\$HOME/Library/pnpm:\$PATH\" LANG=en_US.UTF-8 CI=1 APP_VARIANT=development"
	rn_mac "cd $dir/src && $mac_env && pnpm install --frozen-lockfile \
		&& cd apps/mobile && npx expo prebuild -p ios --clean" >>"$log" 2>&1 ||
		rn_die "ios install/prebuild failed; see $log"
	local scheme
	scheme=$(rn_mac "cd $dir/src/apps/mobile/ios && ls -d *.xcworkspace" | head -n1)
	scheme=${scheme%.xcworkspace}
	[[ -n "$scheme" ]] || rn_die "prebuild produced no .xcworkspace; see $log"
	# Ad-hoc signing (CODE_SIGN_IDENTITY=-) keeps keychain access working for expo-secure-store.
	rn_mac "cd $dir/src/apps/mobile/ios && $mac_env RCT_NO_LAUNCH_PACKAGER=1 \
		&& xcodebuild -workspace '$scheme.xcworkspace' -scheme '$scheme' -configuration Debug -sdk iphonesimulator \
			-destination 'generic/platform=iOS Simulator' -derivedDataPath $dir/dd -jobs 4 \
			CODE_SIGN_IDENTITY=- COMPILER_INDEX_STORE_ENABLE=NO ARCHS=arm64 ONLY_ACTIVE_ARCH=YES build" >>"$log" 2>&1 || {
		tail -n 30 "$log" >&2
		rn_die "xcodebuild failed; see $log"
	}
	local built="$dir/dd/Build/Products/Debug-iphonesimulator/'$scheme.app'"
	rn_mac "test -d $built" || rn_die "xcodebuild succeeded but $scheme.app isn't where expected; see $log"
	# Keep only the .app; the workspace copy and DerivedData are ~6 GB.
	rn_mac "rm -rf $dir/'$scheme.app' && ditto $built $dir/'$scheme.app' \
		&& rm -rf $dir/src $dir/dd \
		&& echo $dir/'$scheme.app' > $dir/ios.app \
		&& printf '%s\n' $fingerprint > $dir/ios.fingerprint"
	rn_log "ios: built $scheme.app on the Mac (kept ~/$RN_APP_MAC_DIR/$scheme.app)"
}

cmd_build() {
	local platform=${1:-}
	shift || true
	case "$platform" in
	android)
		local unit=productivity-e2e-build-android
		systemctl --user is-active --quiet "$unit" && rn_die "an Android build is already running (systemctl --user status $unit)"
		rn_log "android: building in systemd unit $unit (MemoryHigh=$BUILD_MEMORY_HIGH, MemoryMax=$BUILD_MEMORY_MAX)"
		systemd-run --user --wait --pipe --collect --quiet --unit="$unit" \
			-p MemoryHigh="$BUILD_MEMORY_HIGH" -p MemoryMax="$BUILD_MEMORY_MAX" \
			-E PATH -E HOME -E APP_VARIANT -E ANDROID_HOME -E ANDROID_SDK_ROOT -E JAVA_HOME \
			--working-directory="$APP_DIR" \
			"$S/build.sh" --app "$APP_DIR" --port "$METRO_PORT" android "$@"
		;;
	ios) build_ios "$@" ;;
	*) rn_die "usage: e2e.sh build android|ios [--force]" ;;
	esac
}

cmd_devices() {
	local booted
	if rn_is_local; then
		booted=$(adb devices | awk 'NR>1 && $2=="device" {print "android  " $1}')
		if [[ -z "$booted" ]]; then
			rn_log "no Android device on this server's adb: ask the user to turn on Wireless debugging and give its port"
		else
			printf '%s\n' "$booted"
		fi
		return
	fi
	booted=$(rn_mac 'xcrun simctl list devices booted 2>/dev/null | grep -E "\(Booted\)" | sed -E "s/^ +/ios      /"; adb devices 2>/dev/null | awk "NR>1 && \$2==\"device\" {print \"android  \" \$1}"')
	if [[ -z "$booted" ]]; then
		rn_log "no simulators or emulators booted on the Mac"
	else
		printf '%s\n' "$booted"
		rn_log "the Mac has 8 GB of RAM: keep one device booted. A device you didn't open may belong to another thread; ask the user before shutting it down."
	fi
}

cmd_install() {
	local platform=${1:-}
	case "$platform" in
	android)
		"$S/install.sh" --app "$APP_DIR" --port "$METRO_PORT" android
		# install.sh forwards only Metro; the app also calls the API on 127.0.0.1.
		local serial
		serial=$(rn_android_serial)
		rn_adb "$serial" reverse "tcp:$API_PORT" "tcp:$API_PORT" >/dev/null
		rn_adb "$serial" reverse --list | grep -q "tcp:$API_PORT" ||
			rn_die "adb reverse for the API port didn't take"
		rn_log "android: API port $API_PORT forwarded"
		;;
	ios) "$S/install.sh" --app "$APP_DIR" --port "$METRO_PORT" ios ;;
	*) rn_die "usage: e2e.sh install android|ios" ;;
	esac
}

cmd_down() {
	"$S/down.sh" --port "$METRO_PORT"
	if rn_has_session "$WEB_SESSION"; then
		rn_tmux kill-session -t "=$WEB_SESSION"
		rn_log "$WEB_SESSION: stopped"
	fi
}

command=${1:-}
shift || true
case "$command" in
up | build | devices | install | down) "cmd_$command" "$@" ;;
*)
	sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
	exit 1
	;;
esac

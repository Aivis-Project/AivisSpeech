#!/usr/bin/env bash
# macOS の Developer ID 署名と公証を CI / ローカル検証の両方から扱う

set -euo pipefail

function log() {
    echo "[macos-codesign] $*"
}

function fail() {
    echo "[macos-codesign] ERROR: $*" >&2
    exit 1
}

function require_command() {
    local command_name="$1"

    if ! command -v "$command_name" >/dev/null 2>&1; then
        fail "Required command is not available: $command_name"
    fi
}

function require_env() {
    local env_name="$1"

    if [ -z "${!env_name:-}" ]; then
        fail "Required environment variable is not set: $env_name"
    fi
}

function random_password() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -base64 32
        return
    fi

    date +%s | shasum -a 256 | awk '{ print $1 }'
}

function decode_base64_file() {
    local input_value="$1"
    local output_path="$2"

    # GitHub Actions の macOS runner は BSD base64 なので `-D` を優先
    if printf '%s' "$input_value" | base64 -D > "$output_path" 2>/dev/null; then
        return
    fi

    # GNU base64 を使うローカル環境でも同じスクリプトを使えるようにする
    printf '%s' "$input_value" | base64 --decode > "$output_path"
}

function setup_keychain() {
    require_command security
    require_env MACOS_CERTIFICATE_P12_BASE64
    require_env MACOS_CERTIFICATE_PASSWORD

    local temp_root="${RUNNER_TEMP:-/tmp}"
    local keychain_password="${MACOS_KEYCHAIN_PASSWORD:-$(random_password)}"
    local keychain_path="$temp_root/aivisspeech-macos-signing-${GITHUB_RUN_ID:-local}-$$.keychain-db"
    local certificate_path="$temp_root/aivisspeech-macos-certificate-${GITHUB_RUN_ID:-local}-$$.p12"

    decode_base64_file "$MACOS_CERTIFICATE_P12_BASE64" "$certificate_path"

    # CI の一時キーチェーンだけを検索対象に追加し、既存のログインキーチェーンを汚さずに署名する
    security create-keychain -p "$keychain_password" "$keychain_path"
    security set-keychain-settings -lut 21600 "$keychain_path"
    security unlock-keychain -p "$keychain_password" "$keychain_path"
    security import "$certificate_path" \
        -k "$keychain_path" \
        -P "$MACOS_CERTIFICATE_PASSWORD" \
        -T /usr/bin/codesign \
        -T /usr/bin/security
    security set-key-partition-list \
        -S apple-tool:,apple:,codesign: \
        -s \
        -k "$keychain_password" \
        "$keychain_path" >/dev/null

    security list-keychains -d user -s "$keychain_path"

    if [ -n "${GITHUB_ENV:-}" ]; then
        echo "MACOS_KEYCHAIN_PATH=$keychain_path" >> "$GITHUB_ENV"
    fi

    log "macOS signing certificate imported."
    security find-identity -v -p codesigning "$keychain_path"
}

function detect_codesign_identity() {
    local identity="${MACOS_CODESIGN_IDENTITY:-}"
    local -a find_identity_args=(-v -p codesigning)

    if [ -n "$identity" ]; then
        echo "$identity"
        return
    fi

    # CI では一時キーチェーンだけを検索し、ローカルでは通常の検索対象から証明書を探す
    if [ -n "${MACOS_KEYCHAIN_PATH:-}" ]; then
        find_identity_args+=("$MACOS_KEYCHAIN_PATH")
    fi

    identity="$(
        security find-identity "${find_identity_args[@]}" 2>/dev/null \
            | sed -n 's/^.*"\(Developer ID Application: [^"]*\)".*$/\1/p' \
            | head -n 1
    )"

    if [ -z "$identity" ]; then
        fail "Developer ID Application identity was not found. Set MACOS_CODESIGN_IDENTITY if auto-detection fails."
    fi

    echo "$identity"
}

function codesign_common_args() {
    local identity
    identity="$(detect_codesign_identity)"

    if [ -z "$identity" ]; then
        fail "Required environment variable is not set: MACOS_CODESIGN_IDENTITY"
    fi

    echo --force
    # Team ID を持たない ad hoc 署名で Hardened Runtime を有効にすると、
    # PyInstaller の実行ファイルが同梱の Python 共有ライブラリを読み込めなくなる
    if [ "$identity" != "-" ]; then
        echo --options
        echo runtime
        echo --timestamp
    fi

    echo --sign
    echo "$identity"
}

function is_macho_file() {
    local target_path="$1"

    file -b "$target_path" | grep -q 'Mach-O'
}

function should_skip_individual_codesign() {
    local target_path="$1"

    # `.app` のメイン実行ファイルはバンドル署名時に署名する
    [[ "$target_path" == *.app/Contents/MacOS/* ]]
}

function collect_macho_files() {
    local app_path="$1"
    local output_path="$2"

    : > "$output_path"

    while IFS= read -r -d '' target_path; do
        if is_macho_file "$target_path" && ! should_skip_individual_codesign "$target_path"; then
            printf '%s\t%s\n' "${#target_path}" "$target_path" >> "$output_path"
        fi
    done < <(find "$app_path" -type f -print0)

    sort -rn "$output_path" | cut -f2- > "$output_path.sorted"
}

function collect_bundle_paths() {
    local app_path="$1"
    local output_path="$2"

    # 内側の bundle から署名し、最後に親の `.app` を署名する
    find "$app_path" -type d \( -name '*.framework' -o -name '*.app' \) -print \
        | awk '{ print length, $0 }' \
        | sort -rn \
        | cut -d' ' -f2- > "$output_path"
}

function sign_file() {
    local target_path="$1"
    local -a args=()

    while IFS= read -r arg; do
        args+=("$arg")
    done < <(codesign_common_args)

    run_codesign "${args[@]}" "$target_path"
}

function sign_bundle() {
    local bundle_path="$1"
    local entitlements_path="${MACOS_CODESIGN_ENTITLEMENTS:-build/entitlements.mac.plist}"
    local -a args=()

    while IFS= read -r arg; do
        args+=("$arg")
    done < <(codesign_common_args)

    if [[ "$bundle_path" == *.app ]] && [ -f "$entitlements_path" ]; then
        args+=(--entitlements "$entitlements_path")
    fi

    run_codesign "${args[@]}" --deep "$bundle_path"
}

function run_codesign() {
    local output

    # `replacing existing signature` が大量に出るため、成功時は静かにして失敗時だけ詳細を出す
    if ! output="$(codesign "$@" 2>&1)"; then
        echo "$output" >&2
        return 1
    fi
}

function sign_app() {
    local app_path="$1"

    require_command codesign
    require_command file

    if [ ! -d "$app_path" ]; then
        fail "App bundle does not exist: $app_path"
    fi

    local temp_root="${RUNNER_TEMP:-/tmp}"
    local macho_list_path="$temp_root/aivisspeech-macho-files-$$.txt"
    local bundle_list_path="$temp_root/aivisspeech-bundles-$$.txt"

    collect_macho_files "$app_path" "$macho_list_path"
    collect_bundle_paths "$app_path" "$bundle_list_path"

    log "Signing Mach-O files in app bundle."
    while IFS= read -r target_path; do
        sign_file "$target_path"
    done < "$macho_list_path.sorted"

    log "Signing nested bundles in app bundle."
    while IFS= read -r bundle_path; do
        sign_bundle "$bundle_path"
    done < "$bundle_list_path"

    verify_app "$app_path"
}

function verify_app() {
    local app_path="$1"
    local invalid_count=0

    require_command codesign
    require_command file

    log "Verifying app bundle signature."
    codesign --verify --deep --strict --verbose=4 "$app_path"

    # `--deep` の成功後も Mach-O 単位で確認し、Engine 内の署名漏れをログで見つけやすくする
    while IFS= read -r -d '' target_path; do
        if is_macho_file "$target_path"; then
            if ! codesign --verify --verbose=2 "$target_path" >/dev/null 2>&1; then
                echo "Invalid signature: $target_path" >&2
                invalid_count=$((invalid_count + 1))
            fi
        fi
    done < <(find "$app_path" -type f -print0)

    if [ "$invalid_count" -ne 0 ]; then
        fail "Invalid Mach-O signatures found: $invalid_count"
    fi

    log "App bundle signature is valid."
}

function setup_notary_api_key() {
    require_env APPLE_API_KEY_ID
    require_env APPLE_API_KEY_P8_BASE64

    local temp_root="${RUNNER_TEMP:-/tmp}"
    local api_key_path="$temp_root/AuthKey_${APPLE_API_KEY_ID}.p8"

    decode_base64_file "$APPLE_API_KEY_P8_BASE64" "$api_key_path"

    if [ -n "${GITHUB_ENV:-}" ]; then
        echo "APPLE_API_KEY_PATH=$api_key_path" >> "$GITHUB_ENV"
    fi

    echo "$api_key_path"
}

function notarytool_args() {
    local api_key_path="${APPLE_API_KEY_PATH:-}"

    if [ -z "$api_key_path" ]; then
        api_key_path="$(setup_notary_api_key)"
    fi

    echo --key
    echo "$api_key_path"
    echo --key-id
    echo "$APPLE_API_KEY_ID"

    # Individual API key では issuer を渡すと認証に失敗するため、Team key の場合だけ指定する
    if [ -n "${APPLE_API_ISSUER_ID:-}" ]; then
        echo --issuer
        echo "$APPLE_API_ISSUER_ID"
    fi
}

function notarize_app() {
    local app_path="$1"

    require_command ditto
    require_command xcrun

    if [ ! -d "$app_path" ]; then
        fail "App bundle does not exist: $app_path"
    fi

    local temp_root="${RUNNER_TEMP:-/tmp}"
    local archive_path
    archive_path="$temp_root/$(basename "$app_path").notarize-$$.zip"
    local -a auth_args=()

    while IFS= read -r arg; do
        auth_args+=("$arg")
    done < <(notarytool_args)

    log "Creating ZIP archive for app notarization."
    ditto -c -k --keepParent "$app_path" "$archive_path"

    log "Submitting app bundle for notarization."
    xcrun notarytool submit "$archive_path" "${auth_args[@]}" --wait

    log "Stapling notarization ticket to app bundle."
    xcrun stapler staple "$app_path"
    xcrun stapler validate "$app_path"
}

function sign_dmg() {
    local dmg_path="$1"
    local identity
    local -a args=(--force)

    require_command codesign

    if [ ! -f "$dmg_path" ]; then
        fail "DMG file does not exist: $dmg_path"
    fi

    identity="$(detect_codesign_identity)"

    # DMG は Mach-O ではないため hardened runtime のオプションを付けずに署名する
    if [ "$identity" != "-" ]; then
        args+=(--timestamp)
    fi

    args+=(--sign "$identity")

    run_codesign "${args[@]}" "$dmg_path"
    codesign --verify --verbose=4 "$dmg_path"
}

function notarize_file() {
    local file_path="$1"

    require_command xcrun

    if [ ! -f "$file_path" ]; then
        fail "File does not exist: $file_path"
    fi

    local -a auth_args=()

    while IFS= read -r arg; do
        auth_args+=("$arg")
    done < <(notarytool_args)

    log "Submitting file for notarization: $file_path"
    xcrun notarytool submit "$file_path" "${auth_args[@]}" --wait

    log "Stapling notarization ticket: $file_path"
    xcrun stapler staple "$file_path"
    xcrun stapler validate "$file_path"
}

function usage() {
    cat <<'USAGE'
Usage:
  tools/codesign_macos.bash setup-keychain
  tools/codesign_macos.bash sign-app <AivisSpeech.app>
  tools/codesign_macos.bash verify-app <AivisSpeech.app>
  tools/codesign_macos.bash notarize-app <AivisSpeech.app>
  tools/codesign_macos.bash sign-dmg <file.dmg>
  tools/codesign_macos.bash notarize-file <file.dmg|file.zip|file.pkg>
USAGE
}

command_name="${1:-}"
shift || true

case "$command_name" in
    setup-keychain)
        setup_keychain "$@"
        ;;
    sign-app)
        if [ "$#" -ne 1 ]; then
            usage
            exit 1
        fi
        sign_app "$1"
        ;;
    verify-app)
        if [ "$#" -ne 1 ]; then
            usage
            exit 1
        fi
        verify_app "$1"
        ;;
    notarize-app)
        if [ "$#" -ne 1 ]; then
            usage
            exit 1
        fi
        notarize_app "$1"
        ;;
    sign-dmg)
        if [ "$#" -ne 1 ]; then
            usage
            exit 1
        fi
        sign_dmg "$1"
        ;;
    notarize-file)
        if [ "$#" -ne 1 ]; then
            usage
            exit 1
        fi
        notarize_file "$1"
        ;;
    *)
        usage
        exit 1
        ;;
esac

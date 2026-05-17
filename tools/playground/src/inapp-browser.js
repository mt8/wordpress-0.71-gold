// EN: 071-now in-app browser detection (Issue #140).
//
//     The playground boots @php-wasm/web, which needs cross-origin
//     isolation / SharedArrayBuffer and a reliably controlling service
//     worker. Mobile in-app browsers -- the WebViews embedded inside
//     native apps such as X/Twitter, Facebook, Instagram and LINE --
//     often lack or only unreliably support those, so the playground
//     would fail to boot or misbehave there. Rather than show a broken
//     playground, src/main.js calls detectInAppBrowser() up front and,
//     when a mobile in-app browser is detected, shows the "open in your
//     standard browser" screen instead of booting. This mirrors what the
//     official WordPress Playground does.
//
//     The detection is kept here as a small, side-effect-free module so
//     it is unit-testable: it derives everything from the navigator
//     fields passed in (the caller supplies window.navigator in the app
//     and a stub in a test), and returns a plain result object.
// JA: 071-now のアプリ内ブラウザ検出(Issue #140)。
//
//     playground は @php-wasm/web を起動し、それには cross-origin
//     isolation / SharedArrayBuffer と確実にページを制御するサービス
//     ワーカーが必要。モバイルのアプリ内ブラウザ -- X/Twitter・
//     Facebook・Instagram・LINE 等のネイティブアプリに埋め込まれた
//     WebView -- はこれらを欠くか不安定なことが多く、playground は
//     起動に失敗したり誤動作したりしうる。壊れた playground を見せる
//     より、src/main.js は最初に detectInAppBrowser() を呼び、モバイル
//     アプリ内ブラウザを検出したら起動せず「標準ブラウザで開く」画面を
//     表示する。これは公式の WordPress Playground と同じ方針。
//
//     検出は単体テスト可能な小さく副作用のないモジュールとしてここに
//     置く。渡された navigator フィールド(アプリでは window.navigator、
//     テストではスタブ)からすべてを導出し、素のオブジェクトを返す。

// EN: User-agent substrings that identify a specific app's in-app
//     browser. Each entry pairs a case-insensitive marker with the
//     human-readable app name shown on the prompt screen. The markers
//     are the tokens these apps inject into their WebView user-agent:
//     - FBAN/FBAV/FB_IAB: Facebook (and Messenger) in-app browser.
//     - Instagram:        Instagram in-app browser.
//     - Line/:            LINE in-app browser (the trailing slash keeps
//                         it from matching unrelated "line" substrings).
//     - Twitter:          the X/Twitter in-app browser still ships this.
//     - MicroMessenger:   WeChat in-app browser.
//     - Snapchat:         Snapchat in-app browser.
//     - TikTok / BytedanceWebview / musical_ly: TikTok in-app browser.
//     - KAKAOTALK:        KakaoTalk in-app browser.
//     - GSA:              the Google App's in-app browser (Google Search
//                         App), a WebView rather than full Chrome.
//     - Pinterest:        Pinterest in-app browser.
//     - LinkedInApp:      LinkedIn in-app browser.
const APP_MARKERS = [
	{ marker: 'fban', name: 'Facebook' },
	{ marker: 'fbav', name: 'Facebook' },
	{ marker: 'fb_iab', name: 'Facebook' },
	{ marker: 'instagram', name: 'Instagram' },
	{ marker: 'line/', name: 'LINE' },
	{ marker: 'twitter', name: 'X (Twitter)' },
	{ marker: 'micromessenger', name: 'WeChat' },
	{ marker: 'snapchat', name: 'Snapchat' },
	{ marker: 'tiktok', name: 'TikTok' },
	{ marker: 'bytedancewebview', name: 'TikTok' },
	{ marker: 'musical_ly', name: 'TikTok' },
	{ marker: 'kakaotalk', name: 'KakaoTalk' },
	{ marker: 'gsa/', name: 'the Google app' },
	{ marker: 'pinterest', name: 'Pinterest' },
	{ marker: 'linkedinapp', name: 'LinkedIn' },
];

/**
 * Whether a user-agent string looks like a mobile device.
 *
 * The prompt only fires on mobile: a desktop WebView (an Electron app, a
 * desktop embedded browser) still has the cross-origin isolation and
 * service-worker support php-wasm needs, and a desktop user has no "open
 * in browser" affordance to act on. Restricting the WebView heuristics
 * to mobile keeps the false-positive rate down.
 *
 * @param {string} ua The lower-cased user-agent string.
 * @return {boolean} True when the user-agent indicates a mobile device.
 */
function isMobileUserAgent( ua ) {
	return /android|iphone|ipod|ipad|iemobile|mobile|blackberry|bb10|windows phone/.test(
		ua
	);
}

/**
 * Whether a mobile user-agent looks like a WebView rather than a full
 * standalone browser.
 *
 * Beyond the named apps above, the common in-app browsers leave generic
 * fingerprints in the user-agent:
 *
 * - iOS: a real Safari user-agent ends with a "Safari/<version>" token.
 *   An iOS WebView (WKWebView, used by every in-app browser on iOS)
 *   reports the same "AppleWebKit ... Mobile" string but drops the
 *   "Safari/" token -- so an iOS user-agent that is Mobile but has no
 *   "Safari" and no "CriOS"/"FxiOS"/"EdgiOS" (Chrome/Firefox/Edge for
 *   iOS) is a WebView.
 * - Android: an in-app browser typically adds a "; wv)" token inside the
 *   parenthesised platform section -- the WebView marker Android injects.
 *
 * These heuristics catch in-app browsers not on the named list; the
 * named-app match above is the precise path and runs first.
 *
 * @param {string} ua The lower-cased user-agent string.
 * @return {boolean} True when the mobile user-agent looks like a WebView.
 */
function isGenericMobileWebView( ua ) {
	const isIOS = /iphone|ipod|ipad/.test( ua );
	if ( isIOS ) {
		// EN: A genuine iOS browser carries a "safari/" token (Safari) or
		//     an explicit other-browser token; a WKWebView carries none.
		const looksLikeIOSBrowser =
			ua.includes( 'safari/' ) ||
			ua.includes( 'crios/' ) ||
			ua.includes( 'fxios/' ) ||
			ua.includes( 'edgios/' );
		return ! looksLikeIOSBrowser;
	}

	// EN: Android injects "; wv" into the WebView user-agent's platform
	//     section -- the standard Android WebView marker.
	if ( ua.includes( 'android' ) ) {
		return /;\s*wv[);]/.test( ua );
	}

	return false;
}

/**
 * Detect whether the playground is running inside a mobile in-app
 * browser (a WebView embedded in a native app).
 *
 * Pure and side-effect-free: it reads only the navigator fields passed
 * in, so a test can drive it with a stub. src/main.js calls it with
 * window.navigator before booting php-wasm.
 *
 * @param {{userAgent?: string}} [navigatorLike] An object with a
 *        `userAgent` string -- window.navigator in the app, a stub in a
 *        test. Defaults to an empty object (treated as "not detected").
 * @return {{isInApp: boolean, appName: string|null, reason: string}}
 *         `isInApp` is true when a mobile in-app browser is detected;
 *         `appName` names the app when a specific one was matched (null
 *         otherwise); `reason` is a short machine-readable tag --
 *         'named-app', 'mobile-webview' or 'none'.
 */
export function detectInAppBrowser( navigatorLike = {} ) {
	const ua = String( navigatorLike.userAgent || '' ).toLowerCase();

	const notDetected = { isInApp: false, appName: null, reason: 'none' };
	if ( ! ua || ! isMobileUserAgent( ua ) ) {
		return notDetected;
	}

	// EN: Precise path first -- a known app's in-app browser marker.
	for ( const { marker, name } of APP_MARKERS ) {
		if ( ua.includes( marker ) ) {
			return { isInApp: true, appName: name, reason: 'named-app' };
		}
	}

	// EN: Generic mobile-WebView heuristics for the in-app browsers not
	//     on the named list.
	if ( isGenericMobileWebView( ua ) ) {
		return { isInApp: true, appName: null, reason: 'mobile-webview' };
	}

	return notDetected;
}

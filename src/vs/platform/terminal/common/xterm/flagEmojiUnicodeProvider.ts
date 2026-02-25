/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IUnicodeVersionProvider } from '@xterm/headless';

/**
 * Custom char kind used to mark a Regional Indicator symbol in the
 * `charProperties` bit-field so the next RI can detect it should join.
 */
const RI_CHAR_KIND = 1;

// charProperties encoding helpers (mirrors xterm's UnicodeService):
//   bit 0       = shouldJoin
//   bits 1-2    = width (0-3)
//   bits 3+     = charKind
function extractCharKind(propValue: number): number {
	return propValue >> 3;
}

function createPropertyValue(charKind: number, width: number, shouldJoin: boolean): number {
	return (charKind << 3) | (width << 1) | (shouldJoin ? 1 : 0);
}

/**
 * Wraps an existing {@link IUnicodeVersionProvider} and adds proper handling
 * for Regional Indicator symbol pairs (U+1F1E6..U+1F1FF) which combine into
 * flag emojis.
 *
 * The base xterm Unicode providers only set `shouldJoin` when `wcwidth === 0`
 * (combining marks / ZWJ), but Regional Indicator symbols have `wcwidth === 1`
 * so they never join. This wrapper detects RI pairs and tells xterm to combine
 * them into a single width-2 cell.
 *
 * See https://github.com/microsoft/vscode/issues/292946
 */
export function createFlagEmojiUnicodeProvider(base: IUnicodeVersionProvider): IUnicodeVersionProvider {
	return {
		get version() { return base.version; },

		wcwidth(codepoint: number): 0 | 1 | 2 {
			return base.wcwidth(codepoint);
		},

		charProperties(codepoint: number, preceding: number): number {
			if (codepoint >= 0x1F1E6 && codepoint <= 0x1F1FF) {
				if (extractCharKind(preceding) === RI_CHAR_KIND) {
					// Second RI in a pair — join with the first RI into one cell.
					return createPropertyValue(0, 2, true);
				}
				// First (or standalone) RI — mark it so the next codepoint can detect it.
				return createPropertyValue(RI_CHAR_KIND, 2, false);
			}
			return base.charProperties(codepoint, preceding);
		},
	};
}

/**
 * Interface for xterm's internal unicode service (not public API).
 */
interface IXtermUnicodeService {
	_activeProvider: IUnicodeVersionProvider;
	_providers: Record<string, IUnicodeVersionProvider>;
	register(provider: IUnicodeVersionProvider): void;
}

/**
 * Wraps all currently registered unicode providers in the given xterm
 * unicode service with flag-emoji support. This patches providers in-place
 * so that RI pairs are properly joined regardless of which unicode version
 * is active.
 *
 * @param unicodeService The xterm internal unicode service instance
 * @param alreadyWrapped Optional set tracking which provider versions have
 *   already been wrapped, to avoid double-wrapping on repeated calls.
 */
export function installFlagEmojiHandler(unicodeService: unknown, alreadyWrapped?: Set<string>): void {
	const svc = unicodeService as IXtermUnicodeService;
	for (const version of Object.keys(svc._providers)) {
		if (alreadyWrapped?.has(version)) {
			continue;
		}
		svc._providers[version] = createFlagEmojiUnicodeProvider(svc._providers[version]);
		alreadyWrapped?.add(version);
	}
	// Also update the active provider reference
	const activeVersion = svc._activeProvider.version;
	svc._activeProvider = svc._providers[activeVersion];
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createFlagEmojiUnicodeProvider, installFlagEmojiHandler } from '../../common/xterm/flagEmojiUnicodeProvider.js';

interface ITestUnicodeVersionProvider {
	readonly version: string;
	wcwidth(codepoint: number): 0 | 1 | 2;
	charProperties(codepoint: number, preceding: number): number;
}

function extractWidth(propValue: number): number {
	return (propValue >> 1) & 0b11;
}

function extractShouldJoin(propValue: number): boolean {
	return (propValue & 1) === 1;
}

function createPropertyValue(charKind: number, width: number, shouldJoin: boolean): number {
	return (charKind << 3) | (width << 1) | (shouldJoin ? 1 : 0);
}

suite('FlagEmojiUnicodeProvider', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should join regional indicator pairs into one width-2 cell', () => {
		const base: ITestUnicodeVersionProvider = {
			version: '11',
			wcwidth: codepoint => codepoint >= 0x1F1E6 && codepoint <= 0x1F1FF ? 2 : 1,
			charProperties: codepoint => createPropertyValue(0, codepoint >= 0x1F1E6 && codepoint <= 0x1F1FF ? 2 : 1, false)
		};

		const wrapped = createFlagEmojiUnicodeProvider(base);

		const firstRi = wrapped.charProperties(0x1F1FA, 0);
		strictEqual(extractWidth(firstRi), 2);
		strictEqual(extractShouldJoin(firstRi), false);

		const secondRi = wrapped.charProperties(0x1F1F8, firstRi);
		strictEqual(extractWidth(secondRi), 2);
		strictEqual(extractShouldJoin(secondRi), true);
	});

	test('should only wrap each provider version once', () => {
		const base: ITestUnicodeVersionProvider = {
			version: '6',
			wcwidth: () => 1,
			charProperties: () => createPropertyValue(0, 1, false)
		};

		const unicodeService = {
			_activeProvider: base,
			_providers: {
				'6': base
			},
			register: () => { }
		};

		const wrappedVersions = new Set<string>();
		installFlagEmojiHandler(unicodeService, wrappedVersions);
		const firstWrappedProvider = unicodeService._providers['6'];

		installFlagEmojiHandler(unicodeService, wrappedVersions);
		strictEqual(unicodeService._providers['6'], firstWrappedProvider);
	});
});

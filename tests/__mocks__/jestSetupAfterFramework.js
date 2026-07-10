// Enable emojis before each test so existing tests that check emoji-containing
// strings continue to pass. Emoji stripping is tested explicitly in i18n.test.ts.
const { setEmojisEnabled } = require('../../src/i18n');
beforeEach(() => setEmojisEnabled(true));

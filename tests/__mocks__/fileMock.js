// Mock for binary assets (audio files, images, etc.) imported by webpack.
// In the jest test environment these resolve to an empty string so that code
// that imports .ogg / .mp3 / .wav URLs does not crash.
module.exports = '';

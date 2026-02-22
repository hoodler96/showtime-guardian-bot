const Levenshtein = require('levenshtein');

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[.\-_]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function similarity(a, b) {
  const lev = new Levenshtein(a, b);
  return 1 - lev.distance / Math.max(a.length, b.length);
}

module.exports = { normalize, similarity };

/** Conventional Commits (https://www.conventionalcommits.org) — also drives release-please. */
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "body-max-line-length": [1, "always", 120],
  },
};

export default config;

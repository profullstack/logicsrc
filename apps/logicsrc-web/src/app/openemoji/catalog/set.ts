/**
 * Where the OpenEmoji reference set lives. A plain module, not the client
 * one: a server component importing a constant from a "use client" file gets
 * a client reference, not the string.
 */

/** Previews and openemoji.json, served by this site. */
export const SET_URL = "/openemoji/set";
/** Full-size files and the fonts live in the set's repository. */
export const REPO_RAW = "https://raw.githubusercontent.com/profullstack/openemoji/main";
export const REPO_URL = "https://github.com/profullstack/openemoji";

/**
 * Where the OpenIcon reference set lives. A plain module so a server
 * component can import the strings (from a "use client" file it would get
 * client references instead).
 */

/** openicon.json, the SVGs and the subset Nerd Font, served by this site. */
export const GALLERY_SET = "/openicon/set";
/** PNGs at every size and the sprite live in the set's repository. */
export const OPENICON_RAW = "https://raw.githubusercontent.com/profullstack/openicon/main";
export const OPENICON_REPO = "https://github.com/profullstack/openicon";

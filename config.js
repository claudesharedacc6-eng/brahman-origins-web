// =====================================================================
// Brahman Origins website settings: the ONLY file you normally edit.
// One website for the whole project (all four campuses).
// =====================================================================
window.BO_CONFIG = {
  // ---- Supabase: the SAME shared project all three groups use ----
  // Use the anon / publishable key only. NEVER the secret or service_role key.
  SUPABASE_URL: "https://xbnjmtmmclrippwoblew.supabase.co",
  SUPABASE_KEY: "sb_publishable_ktTM2drJhnL2sTcWxODcgA_YBy8w7Iu",

  // Students sign in with Google using this domain. Other Google accounts are refused.
  ALLOWED_DOMAIN: "ub.edu.ph",

  // ---- The Unity web game (files on Cloudflare R2) ----
  // Copy these from your old config.js. Same address you open to see Web.loader.js, without the file name.
  BUILD_FOLDER: "https://game.brahmanorigins.com/Build",
  STREAMING_ASSETS: "https://game.brahmanorigins.com/StreamingAssets",
  BUILD_NAME: "Web",          // Web.loader.js, Web.data.unityweb, ...
  BUILD_EXT: ".unityweb",     // Gzip + Decompression Fallback. Compression Disabled = ""

  // Must match Unity: Player Settings > Company Name / Product Name.
  COMPANY_NAME: "DefaultCompany",
  PRODUCT_NAME: "Brahman Origins",
  // Raise this (1.1, 1.2, ...) every time you upload a new build, so players get the new one.
  PRODUCT_VERSION: "1.2"
};

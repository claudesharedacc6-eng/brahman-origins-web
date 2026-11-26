# Brahman Origins · Player Portal v2

One website for the whole project: sign in, launch the Unity web game, see progress, and run the admin console.
Hosted on GitHub Pages. The game files stay on Cloudflare R2.

## Pages

| Page | Who | What |
|---|---|---|
| `index.html` | everyone | Home, the 4 campuses, leaderboard per campus |
| `guidelines.html` | everyone | How to play, controls |
| `login.html` | everyone | **Login with UB Mail** (Google, @ub.edu.ph only), **Continue as Guest**, and a folded **Staff & admin sign-in** (email + password) |
| `student.html` | UB Mail students | My Progress: level and XP per campus from the game, leaderboards, report a bug, ask a question |
| `play.html` | students, guests, admins | Loads the game from R2 and passes the sign-in to Unity (`WebSessionBridge.ReceiveSession`) |
| `admin.html` | admins only | Live overview, student directory, game reports, inquiries, change password |

Only `config.js` normally needs editing.

## Set up (once)

1. **Back up** the current GitHub repo: Code → Download ZIP.
2. **Replace the repo files.** Delete the old files: `index.html`, `play.html`, `config.js`, the `css` and `js` folders, the old portal's `api` folder (PHP doesn't run on GitHub Pages), and `supabase-schema.sql`. Then upload everything in this folder.
3. **config.js:** paste your R2 address into `BUILD_FOLDER` and `STREAMING_ASSETS` (copy them from your old config.js).
4. **Supabase → SQL Editor**, run in this order:
   1. `sql/portal_security_fixes.sql`
   2. `sql/set-admin.sql`. It makes `brahmanorigins@gmail.com` and `admin@brahmanorigins.com` admins.
   3. `sql/brahman_origins_lipa_leaderboard.sql`, only if you haven't run it before. The leaderboards need it.
5. **Change both admin passwords.** The old `main.js` had one written in it, and it's public on GitHub. Change them in Supabase → Authentication → Users, or with the avatar button in the admin console.
6. **Redirect URLs:** after Google login, players now return to `login.html`. `https://1700565-dotcom.github.io/brahman-origins/**` already covers it.

## Test

- Log in with UB Mail → lands on **My Progress** → **Play the Game** → the game shows your name.
- Log in with a personal Gmail → refused with a message.
- **Continue as Guest** → Play → "Guest · Campus tour".
- Staff sign-in with an admin account → **Admin Console**, with real numbers and no sample data.
- Send a report from My Progress → it appears in **Game Reports** → Mark resolved.

## Adding another campus's scores and progress

Every campus has a tab on the home page, My Progress and the admin console. Until a campus is connected, its tab says "coming soon".

- **Leaderboard:** the campus's group makes a Supabase function like `lipa_leaderboard`, returning `rank, player_name, points, level`. Put its name in that campus's `leaderboard` in `config.js` (`CAMPUSES`).
- **Progress:** add a reader for their progress table in `PROGRESS_SOURCES` in `main.js` (copy the `lipa` one), and put its name in the campus's `progress` in `config.js`.

## Good to know

- **Students** appear in the admin directory after their first sign-in. The list comes from the logins themselves (`portal_students()`), not from any group's table. The website never touches the shared `players` table.
- **Admins who press Play** test the game as a guest, so admin accounts never get game progress.
- **Character** shows Boy for `character_number` 1 and Girl for 2. That matches Boy being first in the Character Roster.
- **Never put** the Supabase secret/service_role key, the Google Client Secret, R2 keys, or any password in these files. Everything here is public.

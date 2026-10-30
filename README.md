# Hangtime

Hangman you can play with friends. Live at **https://hangtime-rouge.vercel.app**

- **Daily word**: the same word for everyone each day, with a shareable result grid.
- **Practice**: endless words from eight kid-friendly categories, with streaks and stats.
- **Optional timer**: 60 seconds to guess and 60 seconds to give a word. Run out while guessing and the turn passes on; run out while giving a word and a random word is drawn. The server keeps the clock.
- **3D hangman**: a blocky wooden gallows that grows one piece per wrong guess, with the guesser's own avatar standing on a crate. Run out of lives and the crate tips over; solve it and they jump for joy.
- **Fair scoring**: every word is worth the same, short or long. Uncovered letters share 60 points, finishing the word earns 40 more plus 5 per life left, and a word nobody solves earns 50 for whoever gave it. Guess a right letter and you go again; miss and the turn passes on.
- **Pass and play**: 2 to 6 players on one device take turns picking words for each other.
- **Online rooms**: create a game, send the link, and play live. You get turns, scores, reactions, nudges and a chat.
- **Team battle (Red vs Blue)**: one team agrees on a word and its category in its private team chat, the other team guesses, then they swap. A live VS scoreboard tracks the score, and the game ends on a podium.
- **3D avatars and animation**: every player picks a full-body 3D chibi character, who jumps for joy when they win. Big moments get animations: a spotlight when it's your turn, counting scores, a wave across the tiles when the word is solved, and a crown for the winner. Motion is reduced when the device asks for it.

## How it works

- `public/` is a static site with no build step: `index.html` (styles), `app.js` (UI) and `logic.js` (game rules).
- `logic.js` holds the game rules. The browser uses it for solo and pass and play, and the server uses it for online games, so the rules can't drift apart.
- `api/game.js` is a single Vercel Function that owns online games. Games live in Upstash Redis and every move goes through a compare-and-set, so simultaneous guesses don't overwrite each other.
- Each player gets a view of the game: guessers never receive the secret word, and each team receives only its own chat.
- Clients poll about once a second. Players are identified by a random key kept in their browser; no accounts are needed.

## Run it locally

```bash
npm test                  # end-to-end tests of the API against an in-memory Redis
node test/dev-server.js   # http://localhost:4321, with an in-memory Redis
```

## Deploy

The repo is connected to Vercel, so pushing to `main` deploys to production. Online play needs Upstash Redis from the Vercel Marketplace (`vercel integration add upstash/upstash-kv`). The function reads `KV_REST_API_URL` and `KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

## Credits

The full-body avatars are rendered from [Mini Characters](https://kenney.nl/assets/mini-characters-1) by Kenney (CC0); `public/avatars/` holds a standing, a jumping and a fallen pose for each character. The gallows scenes in `public/hangman/` were modelled and rendered for this project in three.js.


The 3D reaction icons and the crown are from [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) by Microsoft, used under the MIT License. They're stored in `public/avatars/` and `public/reactions/`, resized to 160 px, and pinned to commit `1ffb34c`.

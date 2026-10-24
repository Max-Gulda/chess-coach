# Chess Coach Board Sync

Optional Chrome extension for following a Chess.com bot game or practice board in the local analysis app. It reads the visible pieces and move list, verifies the position by replaying legal moves, and sends the result to Chess Coach.

## Install

1. From the project folder, run `npm ci` and `npm run extension`.
2. Start the local app with `npm run dev` and open <http://127.0.0.1:4173>.
3. Open `chrome://extensions` in Chrome and enable **Developer mode**.
4. Choose **Load unpacked** and select the generated `extension/dist` folder inside your checkout.
5. Reload any Chess.com tab that was open before installing the extension.

The generated folder is relative to wherever you cloned the project. For example, if the checkout is `projects/chess-coach`, select `projects/chess-coach/extension/dist`.

## Connect a board

1. Open a Chess.com bot game or analysis board with the move list visible.
2. Click **Chess Coach Board Sync** in Chrome’s toolbar and choose **Start syncing this tab**.
3. Enable **Live sync** in the local app.

Choose **Stop syncing this tab** in the extension to disconnect. Turning off **Live sync** pauses updates in the app while retaining the displayed position. Reloading a connected Chess.com tab preserves that tab’s connection; closing the tab stops it.

Use engine assistance only where the platform permits it, such as bot games, practice, and analysis. Do not use it for outside assistance in games against other people.

## Data and permissions

The extension reads the visible board and move list only after you start syncing. It checks for changes once per second and sends a heartbeat every five seconds. Updates go only to `http://127.0.0.1:4173/api/live` on your own computer. It does not request your Chess.com password, read cookies, take screenshots, or make moves.

The manifest requests local storage for connected tabs, access to the active tab for the popup, a content script limited to Chess.com, and permission to contact the loopback address. The local app and extension use the fixed port **4173**; changing that port requires updating both configurations.

## Supported positions

The board must match a legally replayed move history beginning at the normal starting position. Replaying the moves preserves side to move, castling rights, and en passant. If the board cannot be matched, the extension reports an error and leaves the current analysis position intact.

Custom starting positions, hidden or incomplete history, ambiguous repetitions, and unfamiliar site layouts may require PGN/FEN import instead. The extension has been checked against a real Chess.com guest bot game after `1. e4 c5`; other site layouts are not guaranteed. Changes to Chess.com’s markup can require an extension update.

## Troubleshooting

| Message or symptom                     | Action                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| Could not reach Chess Coach            | Start `npm run dev` and open the loopback URL above.                          |
| Reload this Chess.com tab              | Reload after installing or reloading the extension, then start syncing again. |
| Cannot match this board                | Make the complete move list visible, or import a PGN/FEN into the app.        |
| Connected, but the app stays unchanged | Enable **Live sync** in the local app.                                        |

## Check the extension

After building the extension, install Playwright’s browser and run its integration check:

```sh
npx playwright install chromium
node extension/check-sync.mjs
```

To use an installed Chrome instead, set `CHESS_COACH_BROWSER_CHANNEL=chrome` when running the check. The test uses a local Chess.com-style fixture; it does not log in or play an online game.

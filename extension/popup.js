const button = document.querySelector('#toggle');
const status = document.querySelector('#status');
let tab;
let enabled = false;

async function refresh() {
  const state = await chrome.runtime.sendMessage({
    type: 'get-state',
    tabId: tab.id,
  });
  enabled = Boolean(state?.enabled);
  button.textContent = enabled
    ? 'Stop syncing this tab'
    : 'Start syncing this tab';
  status.textContent =
    state?.message || 'Open the move list on Chess.com, then start syncing.';
}

button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'set-enabled',
      tabId: tab.id,
      enabled: !enabled,
    });
    if (!result?.ok)
      throw new Error(
        result?.error ||
          'Could not connect. Reload the Chess.com tab and try again.',
      );
    await refresh();
  } catch {
    status.textContent =
      'Reload this Chess.com tab, then open the extension and try again.';
  } finally {
    button.disabled = false;
  }
});

chrome.tabs
  .query({ active: true, currentWindow: true })
  .then(async (tabs) => {
    tab = tabs[0];
    if (!tab || !/^https:\/\/(?:www\.)?chess\.com\//.test(tab.url || '')) {
      button.textContent = 'Open a Chess.com tab first';
      status.textContent =
        'Choose the Chess.com tab showing the board you want to analyze.';
      return;
    }
    await refresh();
    button.disabled = false;
    setInterval(refresh, 1500);
  })
  .catch(() => {
    status.textContent = 'Could not read this tab. Reload it and try again.';
  });

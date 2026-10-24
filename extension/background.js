const states = new Map();

async function enabledTabs() {
  return (await chrome.storage.local.get('enabledTabs')).enabledTabs || {};
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    const tabId = sender.tab?.id ?? message.tabId;
    if (message.type === 'get-state') {
      return {
        enabled: Boolean((await enabledTabs())[tabId]),
        ...states.get(tabId),
      };
    }
    if (message.type === 'set-enabled') {
      const tabs = await enabledTabs();
      if (message.enabled) tabs[tabId] = true;
      else delete tabs[tabId];
      await chrome.storage.local.set({ enabledTabs: tabs });
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'set-enabled',
          enabled: Boolean(message.enabled),
        });
      } catch (error) {
        delete tabs[tabId];
        await chrome.storage.local.set({ enabledTabs: tabs });
        throw error;
      }
      states.set(tabId, {
        message: message.enabled ? 'Reading the board…' : 'Sync stopped.',
      });
      return { ok: true };
    }
    if (message.type === 'board-update' && sender.tab?.id !== undefined) {
      if (
        !(await enabledTabs())[sender.tab.id] &&
        message.payload.status !== 'stopped'
      )
        return { ok: false };
      try {
        const response = await fetch('http://127.0.0.1:4173/api/live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message.payload),
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok)
          throw new Error(`Local tool returned HTTP ${response.status}.`);
        states.set(sender.tab.id, {
          message:
            message.payload.error ||
            (message.payload.status === 'stopped'
              ? 'Sync stopped.'
              : 'Connected. Board sent to Chess Coach.'),
        });
        return { ok: true };
      } catch {
        states.set(sender.tab.id, {
          message:
            'Could not reach Chess Coach. Start the local tool, then try again.',
        });
        return { ok: false };
      }
    }
    return { ok: false };
  })().then(respond, (error) => respond({ ok: false, error: error.message }));
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabs = await enabledTabs();
  delete tabs[tabId];
  await chrome.storage.local.set({ enabledTabs: tabs });
  states.delete(tabId);
});

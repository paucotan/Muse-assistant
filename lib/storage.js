/**
 * Storage handler
 * Provides functions for interacting with Chrome's storage API
 */

// Default prompt template
const DEFAULT_PROMPT_TEMPLATE = `You are a Zendesk support assistant. Your task is to extract key information from a support ticket and provide a clean, structured summary for internal use.

Create the output in **this format**:

---

### 📝 SUMMARY
A brief 1–2 sentence overview of the customer's request or issue.

### 🐛 ISSUE DESCRIPTION
A clear explanation of the problem in the customer's own context. 

### ✅ SUGGESTED NEXT STEPS
- Recommend 2–3 concrete actions for the support team.
- If needed, mention information to ask the customer.

---

💡 Guidelines:
- Do NOT include a metadata section.
- Do NOT write "Not provided" or "Not mentioned."
- If no action is needed, make that clear in the summary.
- Be concise. Prioritize signal over completeness.`;

// Function to save default prompt template if none exists
async function ensureDefaultPromptTemplate() {
  try {
    const settings = await getSettingsFromStorage();
    if (!settings.promptTemplate) {
      await saveSettingsToStorage({ promptTemplate: DEFAULT_PROMPT_TEMPLATE });
    }
  } catch (error) {
    console.error('Error ensuring default prompt template:', error);
  }
}

// Call this function when the extension loads
ensureDefaultPromptTemplate();

// Function to save settings
function saveSettingsToStorage(settings) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(settings, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

// Function to get settings
function getSettingsFromStorage() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(['zendeskDomain', 'zendeskEmail', 'zendeskToken', 'openaiKey', 'useOllama', 'ollamaUrl', 'ollamaModel', 'promptTemplate'], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });
}

// Function to clear all settings (used for testing or resetting)
function clearSettings() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.clear(() => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

// Function to save last used ticket ID for convenience
function saveLastTicketId(ticketId) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ lastTicketId: ticketId }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

// Function to get last used ticket ID
function getLastTicketId() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['lastTicketId'], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result.lastTicketId || '');
      }
    });
  });
}

// Function to save token usage data
function saveTokenUsage(usage) {
  return new Promise((resolve, reject) => {
    // Get current usage first
    chrome.storage.local.get(['tokenUsage'], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      
      const currentUsage = result.tokenUsage || {
        totalTokens: 0,
        requestCount: 0,
        lastRequest: null,
        dailyUsage: {},
        history: []
      };
      
      // Update usage data
      const updatedUsage = {
        totalTokens: currentUsage.totalTokens + usage.totalTokens,
        requestCount: currentUsage.requestCount + 1,
        lastRequest: new Date().toISOString(),
        dailyUsage: {...currentUsage.dailyUsage},
        history: [...currentUsage.history]
      };
      
      // Update daily usage
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      updatedUsage.dailyUsage[today] = (updatedUsage.dailyUsage[today] || 0) + usage.totalTokens;
      
      // Add to history (keep last 20 requests)
      updatedUsage.history.unshift({
        timestamp: new Date().toISOString(),
        ticketId: usage.ticketId,
        tokens: usage.totalTokens,
        prompt: usage.promptTokens,
        completion: usage.completionTokens
      });
      
      // Limit history to last 20 entries
      if (updatedUsage.history.length > 20) {
        updatedUsage.history = updatedUsage.history.slice(0, 20);
      }
      
      // Save updated usage
      chrome.storage.local.set({ tokenUsage: updatedUsage }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(updatedUsage);
        }
      });
    });
  });
}

// Function to get token usage data
function getTokenUsage() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['tokenUsage'], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result.tokenUsage || {
          totalTokens: 0,
          requestCount: 0,
          lastRequest: null,
          dailyUsage: {},
          history: []
        });
      }
    });
  });
}

// Function to reset token usage data
function resetTokenUsage() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ 
      tokenUsage: {
        totalTokens: 0,
        requestCount: 0,
        lastRequest: null,
        dailyUsage: {},
        history: []
      }
    }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

// Function to save ticket summary to cache
function saveTicketSummaryToCache(ticketId, summary, extractedFields) {
  return new Promise((resolve, reject) => {
    // Get current cache first
    chrome.storage.local.get(['ticketCache'], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      
      const currentCache = result.ticketCache || {};
      
      // Update cache with new summary
      currentCache[ticketId] = {
        summary: summary,
        extractedFields: extractedFields,
        timestamp: new Date().toISOString()
      };
      
      // Save updated cache
      chrome.storage.local.set({ ticketCache: currentCache }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(currentCache[ticketId]);
        }
      });
    });
  });
}

// Function to get ticket summary from cache
function getTicketSummaryFromCache(ticketId) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['ticketCache'], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      
      const cache = result.ticketCache || {};
      
      if (cache[ticketId]) {
        resolve(cache[ticketId]);
      } else {
        resolve(null); // No cached summary for this ticket
      }
    });
  });
}

// Function to clear cache for a specific ticket
function clearTicketCache(ticketId) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['ticketCache'], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      
      const cache = result.ticketCache || {};
      
      if (cache[ticketId]) {
        delete cache[ticketId];
        chrome.storage.local.set({ ticketCache: cache }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      } else {
        resolve(); // Nothing to clear
      }
    });
  });
}

// Function to clear all ticket cache
function clearAllTicketCache() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ ticketCache: {} }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

// Function to get the default prompt template
function getDefaultPromptTemplate() {
  return DEFAULT_PROMPT_TEMPLATE;
}

// Function to reset prompt template to default
async function resetPromptTemplate() {
  try {
    await saveSettingsToStorage({ promptTemplate: DEFAULT_PROMPT_TEMPLATE });
    return DEFAULT_PROMPT_TEMPLATE;
  } catch (error) {
    console.error('Error resetting prompt template:', error);
    throw error;
  }
}

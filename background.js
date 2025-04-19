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

// Initialize when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  // Initialize default settings if they don't exist
  chrome.storage.sync.get(['zendeskDomain', 'zendeskEmail', 'zendeskToken', 'openaiKey', 'useOllama', 'ollamaUrl', 'ollamaModel', 'promptTemplate', 'darkMode'], (result) => {
    const defaultSettings = {
      zendeskDomain: result.zendeskDomain || 'yourcompany.zendesk.com',
      zendeskEmail: result.zendeskEmail || '',
      zendeskToken: result.zendeskToken || '',
      openaiKey: result.openaiKey || '',
      useOllama: result.useOllama || false,
      ollamaUrl: result.ollamaUrl || 'http://localhost:11434',
      ollamaModel: result.ollamaModel || 'llama3',
      promptTemplate: result.promptTemplate || DEFAULT_PROMPT_TEMPLATE,
      darkMode: result.darkMode || false
    };
    
    // Only set values that don't already exist
    chrome.storage.sync.set(defaultSettings);
  });
  
  console.log('Chrome extension installed with the following permissions:');
  chrome.permissions.getAll(permissions => {
    console.log('Permissions:', permissions);
  });
});

// Listen for messages from the popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getCurrentTabUrl') {
    // Get the current active tab URL
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        sendResponse({ url: tabs[0].url });
      } else {
        sendResponse({ url: null });
      }
    });
    return true; // Required for async sendResponse
  }
  
  if (request.action === 'extractTicketId') {
    // Extract ticket ID from URL pattern like https://domain.zendesk.com/agent/tickets/12345
    const url = request.url;
    const match = url.match(/\/tickets\/(\d+)/);
    if (match && match[1]) {
      sendResponse({ ticketId: match[1] });
    } else {
      sendResponse({ ticketId: null });
    }
    return true;
  }
  
  if (request.action === 'getSettings') {
    // Retrieve stored settings
    chrome.storage.sync.get(['zendeskDomain', 'zendeskEmail', 'zendeskToken', 'openaiKey', 'useOllama', 'ollamaUrl', 'ollamaModel', 'promptTemplate', 'darkMode'], (result) => {
      sendResponse(result);
    });
    return true; // Required for async sendResponse
  }
  
  if (request.action === 'saveTokenUsage') {
    // Import the function from storage.js
    try {
      const usage = request.usage;
      // Forward to storage.js functions
      chrome.storage.local.get('tokenUsage', (result) => {
        const currentUsage = result.tokenUsage || {
          totalTokens: 0,
          promptTokens: 0, 
          completionTokens: 0,
          requestCount: 0,
          lastRequest: null,
          history: []
        };
        
        // Update stats
        const updatedUsage = {
          totalTokens: currentUsage.totalTokens + (usage.totalTokens || 0),
          promptTokens: currentUsage.promptTokens + (usage.promptTokens || 0),
          completionTokens: currentUsage.completionTokens + (usage.completionTokens || 0),
          requestCount: currentUsage.requestCount + 1,
          lastRequest: new Date().toISOString(),
          history: [
            {
              timestamp: new Date().toISOString(),
              ticketId: usage.ticketId,
              totalTokens: usage.totalTokens || 0,
              promptTokens: usage.promptTokens || 0,
              completionTokens: usage.completionTokens || 0
            },
            ...(currentUsage.history || [])
          ]
        };
        
        // Limit history to last 20 entries
        if (updatedUsage.history.length > 20) {
          updatedUsage.history = updatedUsage.history.slice(0, 20);
        }
        
        chrome.storage.local.set({ tokenUsage: updatedUsage }, () => {
          sendResponse({ success: true });
        });
      });
    } catch (error) {
      console.error('Error saving token usage:', error);
      sendResponse({ error: error.message });
    }
    return true;
  }
  
  if (request.action === 'getTokenUsage') {
    // Get token usage data
    chrome.storage.local.get('tokenUsage', (result) => {
      sendResponse(result.tokenUsage || { 
        totalTokens: 0, 
        promptTokens: 0, 
        completionTokens: 0,
        requestCount: 0 
      });
    });
    return true;
  }
  
  if (request.action === 'resetTokenUsage') {
    // Reset token usage stats
    chrome.storage.local.set({
      tokenUsage: {
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        requestCount: 0,
        lastRequest: null,
        history: []
      }
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'fetchOllamaModels') {
    // Fetch models from Ollama without CORS restrictions
    let ollamaUrl = request.ollamaUrl || 'http://localhost:11434';
    
    // If URL doesn't have a protocol, add it
    if (!ollamaUrl.startsWith('http://') && !ollamaUrl.startsWith('https://')) {
      ollamaUrl = 'http://' + ollamaUrl;
    }
    
    console.log('Background script: Fetching Ollama models from', ollamaUrl);
    
    // Extract port from the URL if provided
    let customPort = "11434"; // Default Ollama port
    const portMatch = ollamaUrl.match(/:(\d+)/);
    if (portMatch && portMatch[1]) {
      customPort = portMatch[1];
    }
    console.log(`Using port: ${customPort}`);
    
    // Prepare alternate URLs to try
    const alternateUrls = [
      ollamaUrl.endsWith('/') ? ollamaUrl.slice(0, -1) : ollamaUrl,
      `http://localhost:${customPort}`,
      `http://127.0.0.1:${customPort}`
    ];
    
    // Filter out duplicates
    const uniqueUrls = [...new Set(alternateUrls)];
    console.log('Will try these URLs for model fetching:', uniqueUrls);
    
    // Track which URLs have been tried
    const triedUrls = new Set();
    
    // Function to try fetching models from a specific URL
    const tryFetchModels = async (baseUrl) => {
      if (triedUrls.has(baseUrl)) {
        return Promise.reject(new Error(`Already tried ${baseUrl}`));
      }
      
      triedUrls.add(baseUrl);
      console.log(`Trying to fetch models from: ${baseUrl}`);
      
      try {
        // Try checking the version first to determine API compatability
        console.log(`Checking Ollama API version at ${baseUrl}`);
        const versionResponse = await fetch(`${baseUrl}/api/version`, {
          headers: {
            'Accept': 'application/json',
            'Origin': chrome.runtime.getURL('/')
          }
        });
        
        let apiVersion = null;
        let useTagsAPI = true; // Default to newer API
        
        if (versionResponse.ok) {
          try {
            const versionData = await versionResponse.json();
            console.log(`Ollama version detected:`, versionData);
            
            // Try to extract version number for future use
            apiVersion = versionData.version;
            
            // Now we would determine which endpoint to use based on version
            // For now, we'll try the endpoints in sequence regardless
          } catch (e) {
            console.log('Could not parse version data as JSON');
          }
        } else {
          console.log(`Version endpoint not available, status: ${versionResponse.status}`);
        }
        
        // Try /api/tags first (newer Ollama versions)
        console.log(`Trying ${baseUrl}/api/tags`);
        const tagsResponse = await fetch(`${baseUrl}/api/tags`, {
          headers: {
            'Accept': 'application/json',
            'Origin': chrome.runtime.getURL('/')
          }
        });
        
        if (tagsResponse.ok) {
          const data = await tagsResponse.json();
          return data;
        }
        
        // If tags fails, try /api/models (older Ollama versions)
        console.log(`Trying ${baseUrl}/api/models`);
        const modelsResponse = await fetch(`${baseUrl}/api/models`, {
          headers: {
            'Accept': 'application/json',
            'Origin': chrome.runtime.getURL('/')
          }
        });
        
        if (modelsResponse.ok) {
          const data = await modelsResponse.json();
          return data;
        }
        
        // If that fails too, try /api/embeddings to see if Ollama is running
        console.log(`Trying ${baseUrl}/api/embeddings`);
        const embeddingsResponse = await fetch(`${baseUrl}/api/embeddings`, {
          headers: {
            'Accept': 'application/json',
            'Origin': chrome.runtime.getURL('/')
          }
        });
        
        if (embeddingsResponse.ok) {
          // Ollama is running but models endpoint is not working
          // Return a minimal response with just one placeholder model
          return {
            models: [{ name: "default", size: 0 }]
          };
        }
        
        // If all endpoints fail, throw an error
        throw new Error(`Failed to fetch models from ${baseUrl}: ${tagsResponse.status}`);
      } catch (error) {
        console.error(`Error with URL ${baseUrl}:`, error);
        throw error;
      }
    };
    
    // Try each URL in sequence
    const tryNextUrl = async (index = 0) => {
      if (index >= uniqueUrls.length) {
        return Promise.reject(new Error('All Ollama URLs failed'));
      }
      
      try {
        return await tryFetchModels(uniqueUrls[index]);
      } catch (error) {
        console.log(`URL ${uniqueUrls[index]} failed for model fetching, trying next one...`);
        return tryNextUrl(index + 1);
      }
    };
    
    // Start trying URLs
    tryNextUrl()
      .then(data => {
        console.log('Success! Ollama models fetched:', data);
        sendResponse({ success: true, data });
      })
      .catch(error => {
        // Collect debug info
        const debugInfo = {
          triedUrls: Array.from(triedUrls),
          errorMessage: error.message,
          errorStack: error.stack,
          timestamp: new Date().toISOString()
        };
        
        console.error('All Ollama URLs failed for model fetching:', error);
        console.log('Debug information for model fetching:', debugInfo);
        
        sendResponse({ 
          success: false, 
          error: `All Ollama URLs failed for model fetching: ${error.message}`,
          debugInfo: debugInfo,
          data: { models: [{ name: "llama3", size: 0 }] }  // Provide a fallback model for UI to display
        });
      });
    
    return true; // Required for async sendResponse
  }
  
  if (request.action === 'queryOllama') {
    // Make request to Ollama API without CORS restrictions
    let ollamaUrl = request.ollamaUrl || 'http://localhost:11434';
    
    // If URL doesn't have a protocol, add it
    if (!ollamaUrl.startsWith('http://') && !ollamaUrl.startsWith('https://')) {
      ollamaUrl = 'http://' + ollamaUrl;
    }
    const ollamaModel = request.ollamaModel || 'llama3';
    const prompt = request.prompt;
    const options = request.options || {
      temperature: 0.2,
      num_predict: 1024
    };
    
    console.log('Background script: Querying Ollama model', ollamaModel);
    console.log('Using Ollama URL:', ollamaUrl);
    
    // Debug log the beginning of the prompt (first 100 chars)
    console.log('Prompt begins with:', prompt.substring(0, 100) + '...');
    
    // Extract port from the URL if provided
    let customPort = "11434"; // Default Ollama port
    const portMatch = ollamaUrl.match(/:(\d+)/);
    if (portMatch && portMatch[1]) {
      customPort = portMatch[1];
    }
    console.log(`Using port: ${customPort}`);
    
    // Prepare alternate URLs to try
    const alternateUrls = [
      ollamaUrl.endsWith('/') ? ollamaUrl.slice(0, -1) : ollamaUrl,
      `http://localhost:${customPort}`,
      `http://127.0.0.1:${customPort}`
    ];
    
    // Filter out duplicates
    const uniqueUrls = [...new Set(alternateUrls)];
    console.log('Will try these URLs:', uniqueUrls);
    
    // Track which URLs have been tried
    const triedUrls = new Set();
    
    // Function to try an Ollama URL with all possible API endpoints
    const tryOllamaUrl = async (baseUrl) => {
      if (triedUrls.has(baseUrl)) {
        return Promise.reject(new Error(`Already tried ${baseUrl}`));
      }
      
      triedUrls.add(baseUrl);
      console.log(`Trying Ollama URL: ${baseUrl}`);
      
      // First, let's check which API endpoints are available
      try {
        // Try sending a GET request to determine if the server is up and what endpoints are available
        console.log(`Checking Ollama API version at ${baseUrl}`);
        const versionResponse = await fetch(`${baseUrl}/api/version`, {
          headers: {
            'Accept': 'application/json',
            'Origin': chrome.runtime.getURL('/')
          }
        });
        
        let apiVersion = null;
        let preferredEndpoint = 'generate'; // Default to the most common endpoint
        
        if (versionResponse.ok) {
          try {
            const versionData = await versionResponse.json();
            console.log(`Ollama version detected:`, versionData);
            
            // Try to extract version number for future use
            apiVersion = versionData.version;
            
            // Based on version, we could choose different endpoints
            // For now just log it, but we could make decisions based on version
          } catch (e) {
            console.log('Could not parse version data as JSON');
          }
        } else {
          console.log(`Version endpoint not available, status: ${versionResponse.status}`);
        }
        
        // Now proceed with the API call using the preferred endpoint
        console.log(`Trying ${baseUrl}/api/${preferredEndpoint}`);
        const generateResponse = await fetch(`${baseUrl}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Origin': chrome.runtime.getURL('/')
          },
          body: JSON.stringify({
            model: ollamaModel,
            prompt: prompt,
            stream: false,
            options: options
          })
        });
        
        console.log(`/api/generate response status: ${generateResponse.status}`);
        
        if (generateResponse.ok) {
          const data = await generateResponse.json();
          return {
            response: data.response,
            raw_data: data
          };
        }
        
        // If generate fails, try the chat API
        console.log(`Trying ${baseUrl}/api/chat`);
        const chatResponse = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Origin': chrome.runtime.getURL('/')
          },
          body: JSON.stringify({
            model: ollamaModel,
            messages: [{ role: 'user', content: prompt }],
            stream: false,
            options: options
          })
        });
        
        console.log(`/api/chat response status: ${chatResponse.status}`);
        
        if (chatResponse.ok) {
          const data = await chatResponse.json();
          return {
            response: data.message?.content || JSON.stringify(data),
            raw_data: data
          };
        }
        
        // If both APIs fail, try older Ollama completions API
        console.log(`Trying ${baseUrl}/api/completions`);
        const completionsResponse = await fetch(`${baseUrl}/api/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Origin': chrome.runtime.getURL('/')
          },
          body: JSON.stringify({
            model: ollamaModel,
            prompt: prompt,
            options: options
          })
        });
        
        console.log(`/api/completions response status: ${completionsResponse.status}`);
        
        if (completionsResponse.ok) {
          const data = await completionsResponse.json();
          return {
            response: data.choices?.[0]?.text || data.completion || JSON.stringify(data),
            raw_data: data
          };
        }
        
        // If all APIs fail, create a more informative error message
        if (!generateResponse.ok) {
          const errorText = await generateResponse.text();
          
          // Special error handling for 403 Forbidden (CORS issue)
          if (generateResponse.status === 403) {
            throw new Error(`Ollama API error (403 Forbidden): CORS policy restriction. To fix this, restart Ollama with: OLLAMA_ORIGINS=* ollama serve`);
          } else {
            throw new Error(`Ollama API error (${generateResponse.status}): ${errorText}`);
          }
        }
      } catch (error) {
        console.error(`Error with URL ${baseUrl}:`, error);
        throw error;
      }
    };
    
    // Try each URL in sequence
    const tryNextUrl = async (index = 0) => {
      if (index >= uniqueUrls.length) {
        return Promise.reject(new Error('All Ollama URLs failed'));
      }
      
      try {
        return await tryOllamaUrl(uniqueUrls[index]);
      } catch (error) {
        console.log(`URL ${uniqueUrls[index]} failed, trying next one...`);
        return tryNextUrl(index + 1);
      }
    };
    
    // Start trying URLs
    tryNextUrl()
      .then(data => {
        console.log('Success! Ollama API response received');
        sendResponse({ success: true, data });
      })
      .catch(error => {
        // Collect debug info
        const debugInfo = {
          triedUrls: Array.from(triedUrls),
          errorMessage: error.message,
          errorStack: error.stack,
          timestamp: new Date().toISOString()
        };
        
        console.error('All Ollama URLs failed:', error);
        console.log('Debug information:', debugInfo);
        
        // Send back detailed error
        sendResponse({ 
          success: false, 
          error: `All Ollama URLs failed: ${error.message}`,
          debugInfo: debugInfo
        });
      });
    
    return true; // Required for async sendResponse
  }
  
  // Handle getDefaultPromptTemplate action
  if (request.action === 'getDefaultPromptTemplate') {
    // Send back the template
    sendResponse({ 
      success: true, 
      template: DEFAULT_PROMPT_TEMPLATE
    });
    
    return true;
  }
  
  // Handle resetPromptTemplate action
  if (request.action === 'resetPromptTemplate') {
    // Reset the prompt template by setting it to the default
    chrome.storage.sync.get(['promptTemplate'], (result) => {
      // Set the prompt template to the default
      chrome.storage.sync.set({ promptTemplate: DEFAULT_PROMPT_TEMPLATE }, () => {
        // Send back the template
        sendResponse({ 
          success: true, 
          template: DEFAULT_PROMPT_TEMPLATE
        });
      });
    });
    
    return true;
  }
  
  // Handle getSettings action 
  if (request.action === 'getSettings') {
    chrome.storage.sync.get(null, (settings) => {
      sendResponse(settings);
    });
    
    return true;
  }
});

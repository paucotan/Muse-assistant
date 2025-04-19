// Global variables
let extractedFields = {};
let ticketData = null; // Store full ticket data for follow-up questions
const processingSteps = [
  "Analyzing ticket conversation...",
  "Extracting customer return details...",
  "Preparing summary..."
];
let currentStep = 0;
let loadingInterval = null;
let currentTicketId = null;

// DOM elements
const extractBtn = document.getElementById('extractBtn');
const currentTicketIdElement = document.getElementById('currentTicketId');
const ticketStatus = document.getElementById('ticketStatus');
const emptyState = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const summaryResult = document.getElementById('summaryResult');
const summaryContent = document.getElementById('summaryContent');
const summaryActions = document.getElementById('summaryActions');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const mainContent = document.getElementById('mainContent');
const successToast = document.getElementById('successToast');
const toastMessage = document.getElementById('toastMessage');
const copyBtn = document.getElementById('copyBtn');
const loadingText = document.getElementById('loadingText');
const scanCurrentBtn = document.getElementById('scanCurrentBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const tokenUsageElement = document.getElementById('tokenUsage');
const viewUsageDetailsBtn = document.getElementById('viewUsageDetailsBtn');
const resetUsageBtn = document.getElementById('resetUsageBtn');
const darkModeToggle = document.getElementById('darkMode');

// Follow-up question elements
const followupQuestion = document.getElementById('followupQuestion');
const askFollowupBtn = document.getElementById('askFollowupBtn');
const followupAnswer = document.getElementById('followupAnswer');
const followupAnswerText = document.getElementById('followupAnswerText');

// Load settings fields
const zendeskDomain = document.getElementById('zendeskDomain');
const zendeskEmail = document.getElementById('zendeskEmail');
const zendeskToken = document.getElementById('zendeskToken');
const openaiKey = document.getElementById('openaiKey');

// Ollama settings fields
const useOllama = document.getElementById('useOllama');
const ollamaUrl = document.getElementById('ollamaUrl');
const ollamaModel = document.getElementById('ollamaModel');
const fetchModelsBtn = document.getElementById('fetchModelsBtn');
const modelFetchStatus = document.getElementById('modelFetchStatus');
const testOllamaBtn = document.getElementById('testOllamaBtn');
const ollamaStatus = document.getElementById('ollamaStatus');
const ollamaStatusText = document.getElementById('ollamaStatusText');
const ollamaStatusIndicator = document.getElementById('ollamaStatusIndicator');

// Prompt template fields
const promptTemplate = document.getElementById('promptTemplate');
const resetPromptBtn = document.getElementById('resetPromptBtn');

// Function to apply theme based on dark mode setting
function applyTheme(isDarkMode) {
  if (isDarkMode) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

// Initialize the popup
document.addEventListener('DOMContentLoaded', () => {
  // Load settings
  loadSettings();
  
  // Check if we are on a Zendesk ticket page
  checkCurrentTab();
  
  // Add event listeners
  extractBtn.addEventListener('click', extractTicketInfo);
  scanCurrentBtn.addEventListener('click', scanCurrentTicket);
  settingsBtn.addEventListener('click', showSettings);
  closeSettingsBtn.addEventListener('click', hideSettings);
  saveSettingsBtn.addEventListener('click', saveSettings);
  copyBtn.addEventListener('click', copyToClipboard);
  
  // Remove the autofill button reference since we no longer have it
  // fillBtn.addEventListener('click', autofillFields);
  
  // Follow-up question event listener
  askFollowupBtn.addEventListener('click', askFollowupQuestion);
  
  // Enter key on follow-up question textarea
  followupQuestion.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      askFollowupQuestion();
    }
  });
  
  // Add token usage stats event listeners
  if (viewUsageDetailsBtn) {
    viewUsageDetailsBtn.addEventListener('click', viewTokenUsageDetails);
  }
  
  if (resetUsageBtn) {
    resetUsageBtn.addEventListener('click', resetTokenUsage);
  }
  
  // Check for token usage on startup
  updateTokenUsageDisplay();
});

// Function to load settings from storage
function loadSettings() {
  chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
    if (response) {
      zendeskDomain.value = response.zendeskDomain || '';
      zendeskEmail.value = response.zendeskEmail || '';
      zendeskToken.value = response.zendeskToken || '';
      openaiKey.value = response.openaiKey || '';
      
      // Ollama settings
      useOllama.checked = response.useOllama || false;
      ollamaUrl.value = response.ollamaUrl || 'http://localhost:11434';
      ollamaModel.value = response.ollamaModel || 'llama3';
      
      // Dark mode setting
      darkModeToggle.checked = response.darkMode || false;
      applyTheme(darkModeToggle.checked);
      
      // Prompt template settings
      if (response.promptTemplate) {
        promptTemplate.value = response.promptTemplate;
      } else {
        // No prompt template in storage, fetch the default
        chrome.runtime.sendMessage({ action: 'getDefaultPromptTemplate' }, (templateResponse) => {
          if (templateResponse && templateResponse.template) {
            promptTemplate.value = templateResponse.template;
          }
        });
      }
      
      // Toggle OpenAI key visibility based on Ollama setting
      toggleOpenAIKeyVisibility();
    }
  });
  
  // Add event listener for the Ollama toggle
  useOllama.addEventListener('change', toggleOpenAIKeyVisibility);
  
  // Add event listeners for Ollama buttons
  fetchModelsBtn.addEventListener('click', fetchOllamaModels);
  testOllamaBtn.addEventListener('click', testOllamaConnection);
  
  // Add event listener for reset prompt button
  resetPromptBtn.addEventListener('click', resetPromptToDefault);
  
  // Add event listener for dark mode toggle
  darkModeToggle.addEventListener('change', () => {
    applyTheme(darkModeToggle.checked);
  });
  
  // If Ollama is enabled, try to fetch models and test connection automatically
  if (useOllama.checked) {
    fetchOllamaModels();
    testOllamaConnection();
  }
  
  // Test connection when URL changes
  ollamaUrl.addEventListener('blur', () => {
    if (useOllama.checked) {
      testOllamaConnection();
    }
  });
}

// Function to toggle OpenAI key field opacity based on Ollama choice
function toggleOpenAIKeyVisibility() {
  const openaiKeyField = openaiKey.closest('div');
  if (useOllama.checked) {
    openaiKeyField.classList.add('opacity-50');
    openaiKey.placeholder = 'Not required when using Ollama';
    
    // Show the Ollama connection status indicator
    ollamaStatus.classList.remove('opacity-0');
    
    // Test the connection when Ollama is enabled
    testOllamaConnection();
  } else {
    openaiKeyField.classList.remove('opacity-50');
    openaiKey.placeholder = 'OpenAI API Key';
    
    // Hide the Ollama connection status indicator
    ollamaStatus.classList.add('opacity-0');
  }
}

// Function to test Ollama connection and update status indicator
async function testOllamaConnection() {
  if (!useOllama.checked) return;
  
  // Show testing state
  ollamaStatusText.textContent = 'Testing...';
  ollamaStatusIndicator.className = 'inline-block w-3 h-3 rounded-full bg-yellow-500 animate-pulse';
  ollamaStatus.classList.remove('opacity-0');
  
  try {
    // Get the current Ollama URL from the input field
    const ollamaUrlValue = ollamaUrl.value || 'http://localhost:11434';
    
    // Use the background script to test the connection
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { 
          action: 'fetchOllamaModels', 
          ollamaUrl: ollamaUrlValue 
        }, 
        (response) => resolve(response)
      );
    });
    
    if (response && response.success) {
      // Connection successful for model fetching
      ollamaStatusText.textContent = 'Connected';
      ollamaStatusIndicator.className = 'inline-block w-3 h-3 rounded-full bg-green-500';
      
      // Also update the model dropdown as a bonus
      updateModelDropdown(response.data);
      
      // Now test if we can actually generate text (this often fails due to CORS)
      await testOllamaGeneration(ollamaUrlValue);
    } else {
      // Connection failed
      ollamaStatusText.textContent = 'Not connected';
      ollamaStatusIndicator.className = 'inline-block w-3 h-3 rounded-full bg-red-500';
      
      // Check if it's specifically a CORS error (403 Forbidden)
      const isCorsError = response?.debugInfo?.errorMessage && 
                        (response.debugInfo.errorMessage.includes('403') || 
                         response.debugInfo.errorMessage.includes('Forbidden'));
      
      if (isCorsError) {
        // Show CORS-specific error message
        showCorsWarning();
      }
    }
  } catch (error) {
    // Error testing connection
    ollamaStatusText.textContent = 'Error connecting';
    ollamaStatusIndicator.className = 'inline-block w-3 h-3 rounded-full bg-red-500';
    
    console.error('Error testing Ollama connection:', error);
  }
}

// Function to test if we can generate text with Ollama (which often fails due to CORS)
async function testOllamaGeneration(ollamaUrlValue) {
  try {
    // Try a simple completion to test if generation works
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'queryOllama',
        ollamaUrl: ollamaUrlValue,
        ollamaModel: ollamaModel.value || 'llama3',
        prompt: 'Say "test successful" in one short sentence.',
        options: {
          temperature: 0.1,
          num_predict: 20
        }
      }, (response) => resolve(response));
    });
    
    if (!response || !response.success) {
      // If it's a 403 error, this is likely CORS
      const is403Error = response?.debugInfo?.errorMessage && 
                        (response.debugInfo.errorMessage.includes('403') || 
                         response.debugInfo.errorMessage.includes('Forbidden'));
      
      if (is403Error) {
        // Show CORS warning - models work but generation doesn't
        showCorsWarning();
        
        // Update status to partial
        ollamaStatusText.textContent = 'CORS issue';
        ollamaStatusIndicator.className = 'inline-block w-3 h-3 rounded-full bg-yellow-500';
      }
    }
  } catch (error) {
    console.error('Error testing Ollama generation:', error);
  }
}

// Function to show CORS warning
function showCorsWarning() {
  // Create a warning banner at the top of the settings panel
  let corsWarning = document.getElementById('corsWarning');
  
  // If it doesn't exist, create it
  if (!corsWarning) {
    corsWarning = document.createElement('div');
    corsWarning.id = 'corsWarning';
    corsWarning.className = 'p-3 mb-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 text-sm';
    
    corsWarning.innerHTML = `
      <div class="font-bold mb-1">CORS Restriction Detected</div>
      <p>Ollama is running, but Chrome cannot access it due to CORS security restrictions.</p>
      <div class="mt-2">
        <strong>To fix this:</strong> Restart Ollama with CORS headers enabled:
        <div class="bg-yellow-50 p-2 mt-1 rounded font-mono text-xs">
          <div>Windows: <code>set OLLAMA_ORIGINS=* && ollama serve</code></div>
          <div>Mac/Linux: <code>OLLAMA_ORIGINS=* ollama serve</code></div>
        </div>
      </div>
    `;
    
    // Add a close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'absolute top-1 right-1 text-yellow-800';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => corsWarning.remove());
    corsWarning.appendChild(closeBtn);
    
    // Add to the DOM as the first child of the settings content
    const settingsContent = document.querySelector('#settingsPanel > div:nth-child(2)');
    settingsContent.insertBefore(corsWarning, settingsContent.firstChild);
  }
}

// Helper function to update model dropdown from connection test
function updateModelDropdown(data) {
  // Only update if we have data
  if (!data) return;
  
  // Process the data in the same way fetchOllamaModels does
  let models = [];
  
  if (data.models && Array.isArray(data.models)) {
    // Format 1: { models: [{ name, size }] }
    models = data.models;
  } else if (Array.isArray(data)) {
    // Format 2: [{ name, size }]
    models = data;
  } else if (data.models && typeof data.models === 'object') {
    // Format 3: { models: { name1: {}, name2: {} } }
    models = Object.keys(data.models).map(name => ({
      name,
      size: data.models[name].size || 0
    }));
  }
  
  // Always clear existing options except the default one
  while (ollamaModel.options.length > 1) {
    ollamaModel.remove(1);
  }
  
  if (models.length > 0) {
    // Add models to the select element
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.name;
      option.textContent = `${model.name}${model.size ? ` (${formatFileSize(model.size)})` : ''}`;
      ollamaModel.appendChild(option);
    });
    
    // Update the status message
    modelFetchStatus.textContent = `Found ${models.length} models`;
    modelFetchStatus.className = 'mt-1 text-xs text-zendesk-success';
    modelFetchStatus.classList.remove('hidden');
    
    // Add a popular models list if none are installed yet
    if (models.length === 1 && models[0].name === "default") {
      const popularModels = ["llama3", "llama3:8b", "phi3", "mistral"];
      
      const optgroup = document.createElement('optgroup');
      optgroup.label = "Popular models (run 'ollama pull <model>' to install)";
      
      popularModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        option.disabled = true;
        optgroup.appendChild(option);
      });
      
      ollamaModel.appendChild(optgroup);
      
      // Update status message to suggest installing models
      modelFetchStatus.textContent = "No models found. Use 'ollama pull <model>' to install.";
      modelFetchStatus.className = 'mt-1 text-xs text-zendesk-blue';
    }
  } else {
    // Handle the case of an empty models array
    // Add a helpful message to the dropdown
    const option = document.createElement('option');
    option.value = "";
    option.textContent = "-- No models found --";
    option.disabled = true;
    ollamaModel.appendChild(option);
    
    // Update the status message
    modelFetchStatus.textContent = "No models found. Use 'ollama pull <model>' to install.";
    modelFetchStatus.className = 'mt-1 text-xs text-zendesk-error';
    modelFetchStatus.classList.remove('hidden');
  }
}

// Function to reset prompt template to default
function resetPromptToDefault() {
  chrome.runtime.sendMessage({ action: 'resetPromptTemplate' }, (response) => {
    if (response && response.template) {
      promptTemplate.value = response.template;
      showToast('Prompt template reset to default');
    } else {
      showError('Failed to reset prompt template');
    }
  });
}

// Function to save settings
function saveSettings() {
  const settings = {
    zendeskDomain: zendeskDomain.value,
    zendeskEmail: zendeskEmail.value,
    zendeskToken: zendeskToken.value,
    openaiKey: openaiKey.value,
    
    // Ollama settings
    useOllama: useOllama.checked,
    ollamaUrl: ollamaUrl.value || 'http://localhost:11434',
    ollamaModel: ollamaModel.value || 'llama3',
    
    // Dark mode setting
    darkMode: darkModeToggle.checked,
    
    // Prompt template setting
    promptTemplate: promptTemplate.value
  };
  
  chrome.storage.sync.set(settings, () => {
    // Show success toast
    showToast('Settings saved successfully!');
    hideSettings();
  });
}

// Function to check if we're on a Zendesk ticket page
function checkCurrentTab() {
  chrome.runtime.sendMessage({ action: 'getCurrentTabUrl' }, (response) => {
    if (response && response.url) {
      chrome.runtime.sendMessage({ action: 'extractTicketId', url: response.url }, (result) => {
        if (result && result.ticketId) {
          // Update the currentTicketId
          currentTicketId = result.ticketId;
          
          // Update UI elements
          currentTicketIdElement.textContent = '#' + result.ticketId;
          ticketStatus.textContent = 'Ready for extraction';
          ticketStatus.classList.remove('bg-zendesk-lightGrey');
          ticketStatus.classList.add('bg-zendesk-teal', 'text-white');
          
          // Enable extract button
          extractBtn.disabled = false;
          extractBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
          // Reset UI for no valid ticket
          currentTicketIdElement.textContent = '--';
          ticketStatus.textContent = 'Not on a ticket page';
          ticketStatus.classList.remove('bg-zendesk-teal', 'text-white');
          ticketStatus.classList.add('bg-zendesk-lightGrey', 'text-zendesk-text');
          
          // Disable extract button
          extractBtn.disabled = true;
          extractBtn.classList.add('opacity-50', 'cursor-not-allowed');
          
          // Show error if we're trying to detect explicitly
          if (scanCurrentBtn.getAttribute('data-scanning') === 'true') {
            showError('Not on a Zendesk ticket page. Please navigate to a ticket page first.');
            scanCurrentBtn.removeAttribute('data-scanning');
          }
          
          // Clear any follow-up question content
          followupQuestion.value = '';
          followupAnswer.classList.add('hidden');
        }
      });
    } else {
      // Update UI for no access to current tab
      currentTicketIdElement.textContent = '--';
      ticketStatus.textContent = 'Cannot access tab';
      ticketStatus.classList.remove('bg-zendesk-teal', 'text-white');
      ticketStatus.classList.add('bg-zendesk-lightGrey', 'text-zendesk-text');
      
      // Disable extract button
      extractBtn.disabled = true;
      extractBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
  });
}

// Function to scan the current ticket
function scanCurrentTicket() {
  // Set a flag to indicate we're explicitly scanning
  scanCurrentBtn.setAttribute('data-scanning', 'true');
  
  // Hide any existing error messages
  errorMessage.classList.add('hidden');
  
  // Update UI to show scanning
  ticketStatus.textContent = 'Scanning...';
  
  // Check the current tab
  checkCurrentTab();
}

// Function to extract information from the current ticket
async function extractTicketInfo() {
  // Make sure we have a current ticket ID
  if (!currentTicketId) {
    showError('No ticket detected. Please navigate to a Zendesk ticket page.');
    return;
  }
  
  // Get settings
  const settings = await getSettings();
  if (!validateSettings(settings)) {
    return;
  }
  
  // Show loading state
  showLoading();
  
  try {
    // Check if we have a cached summary for this ticket
    const cachedData = await getTicketSummaryFromCache(currentTicketId);
    
    if (cachedData) {
      // Use cached data
      showToast('Using cached summary for this ticket');
      
      // Extract fields and display from cache
      extractedFields = cachedData.extractedFields;
      displaySummary(cachedData.summary);
      
      // Display token usage info
      updateTokenUsageDisplay();
      
      // Show a small indicator that this is cached data
      if (summaryResult) {
        const cachedIndicator = document.createElement('div');
        cachedIndicator.className = 'text-xs text-zendesk-text mt-1';
        cachedIndicator.innerHTML = `<span class="inline-flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Cached from ${new Date(cachedData.timestamp).toLocaleString()}
        </span>`;
        
        summaryResult.appendChild(cachedIndicator);
      }
      
      return;
    }
    
    // No cache, proceed with API request
    // Fetch ticket comments and ticket data
    const ticketData = await fetchTicketComments(settings, currentTicketId);
    
    if (!ticketData || !ticketData.comments || ticketData.comments.length === 0) {
      showError('No comments found for this ticket');
      return;
    }
    
    // Update loading text
    currentStep = 1;
    loadingText.textContent = processingSteps[currentStep];
    
    // Generate summary with OpenAI using all ticket data
    const summary = await generateSummary(settings, ticketData, currentTicketId);
    
    // Update loading text
    currentStep = 2;
    loadingText.textContent = processingSteps[currentStep];
    
    // Extract fields from summary
    extractedFields = extractFieldsFromSummary(summary);
    
    // Save to cache
    await saveTicketSummaryToCache(currentTicketId, summary, extractedFields);
    
    // Display summary
    displaySummary(summary);
    
    // Display token usage info
    updateTokenUsageDisplay();
    
  } catch (error) {
    console.error('Error extracting information:', error);
    // Pass debug info if available for better error reporting
    showError(error.message || 'Failed to extract information', error.debugInfo);
  } finally {
    // Hide loading state
    hideLoading();
  }
}

// Function to show loading state
function showLoading() {
  // Hide other states
  emptyState.classList.add('hidden');
  summaryResult.classList.add('hidden');
  summaryActions.classList.add('hidden');
  errorMessage.classList.add('hidden');
  
  // Show loading state
  loadingState.classList.remove('hidden');
  
  // Start loading step animation
  currentStep = 0;
  loadingText.textContent = processingSteps[currentStep];
  
  loadingInterval = setInterval(() => {
    currentStep = (currentStep + 1) % processingSteps.length;
    loadingText.textContent = processingSteps[currentStep];
  }, 1500);
}

// Function to hide loading state
function hideLoading() {
  loadingState.classList.add('hidden');
  
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }
}

// Function to display summary
function displaySummary(summary) {
  // Create HTML for the summary
  let extractedFieldsHtml = '<ul class="list-disc pl-5 space-y-1">';
  let summaryHtml = '';
  let issueDescriptionHtml = '';
  let suggestionsHtml = '';
  let urgencyHtml = '';
  
  // Split by lines
  const lines = summary.trim().split('\n');
  
  // Track which section we're in
  let currentSection = 'fields'; // Can be 'fields', 'summary', 'issue', 'suggestions', 'urgency'
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip empty lines
    if (line === '') continue;
    
    // Check for emoji section headers
    if (line.startsWith('📝 SUMMARY') || line.includes('📝 SUMMARY')) {
      // Close the fields list if we're transitioning from there
      if (currentSection === 'fields') {
        extractedFieldsHtml += '</ul>';
      }
      currentSection = 'summary';
      continue;
    } else if (line.startsWith('🐛 ISSUE DESCRIPTION') || line.includes('🐛 ISSUE')) {
      currentSection = 'issue';
      continue;
    } else if (line.startsWith('✅ SUGGESTED NEXT STEPS') || line.includes('✅ SUGGESTED')) {
      currentSection = 'suggestions';
      continue;
    } else if (line.startsWith('🚨 TICKET URGENCY') || line.includes('🚨 TICKET')) {
      currentSection = 'urgency';
      continue;
    }
    
    // Process line based on the current section
    if (currentSection === 'fields') {
      // Process fields - typically bullet points or key-value pairs
      let formattedLine = line;
      
      // Format line with field name in bold if it contains a colon
      if (line.includes(':')) {
        const parts = line.split(':', 2);
        formattedLine = `<span class="font-medium">${parts[0]}:</span>${parts[1]}`;
      }
      
      extractedFieldsHtml += `<li>${formattedLine}</li>`;
    } 
    else if (currentSection === 'summary') {
      // Accumulate summary lines
      summaryHtml += line + ' ';
    }
    else if (currentSection === 'issue') {
      // Process issue description - typically bullet points
      if (issueDescriptionHtml === '') {
        issueDescriptionHtml = '<ul class="list-disc pl-5 space-y-1">';
      }
      
      // Check if it's a bullet point
      if (line.startsWith('•') || line.startsWith('-')) {
        issueDescriptionHtml += `<li>${line.substring(1).trim()}</li>`;
      } else if (line.match(/^\d+\.\s/)) {
        // Numbered list item like "1. "
        issueDescriptionHtml += `<li>${line.replace(/^\d+\.\s/, '')}</li>`;
      } else {
        // Just a regular line
        issueDescriptionHtml += `<li>${line}</li>`;
      }
    }
    else if (currentSection === 'suggestions') {
      // Process suggestions - typically bullet points
      if (suggestionsHtml === '') {
        suggestionsHtml = '<ul class="list-disc pl-5 space-y-1">';
      }
      
      // Check if it's a bullet point
      if (line.startsWith('•') || line.startsWith('-')) {
        suggestionsHtml += `<li>${line.substring(1).trim()}</li>`;
      } else if (line.match(/^\d+\.\s/)) {
        // Numbered list item like "1. "
        suggestionsHtml += `<li>${line.replace(/^\d+\.\s/, '')}</li>`;
      } else {
        // Just a regular line
        suggestionsHtml += `<li>${line}</li>`;
      }
    }
    else if (currentSection === 'urgency') {
      // Accumulate urgency info
      urgencyHtml += line + ' ';
    }
  }
  
  // Close any open HTML tags
  if (currentSection === 'fields') {
    extractedFieldsHtml += '</ul>';
  }
  if (issueDescriptionHtml !== '' && !issueDescriptionHtml.endsWith('</ul>')) {
    issueDescriptionHtml += '</ul>';
  }
  if (suggestionsHtml !== '' && !suggestionsHtml.endsWith('</ul>')) {
    suggestionsHtml += '</ul>';
  }
  
  // Assemble the final HTML
  let finalHtml = extractedFieldsHtml;
  
  // Add the summary section if it exists
  if (summaryHtml.trim() !== '') {
    finalHtml += `
      <div class="mt-3 pt-2 border-t border-zendesk-border">
        <h3 class="font-medium text-sm mb-1">📝 Summary</h3>
        <p class="text-sm">${summaryHtml.trim()}</p>
      </div>
    `;
  }
  
  // Add the issue description section if it exists
  if (issueDescriptionHtml.trim() !== '') {
    finalHtml += `
      <div class="mt-3 pt-2 border-t border-zendesk-border">
        <h3 class="font-medium text-sm mb-1">🐛 Issue Description</h3>
        ${issueDescriptionHtml.trim()}
      </div>
    `;
  }
  
  // Add the suggestions section if it exists
  if (suggestionsHtml.trim() !== '') {
    finalHtml += `
      <div class="mt-3 pt-2 border-t border-zendesk-border">
        <h3 class="font-medium text-sm mb-1">✅ Suggested Next Steps</h3>
        ${suggestionsHtml.trim()}
      </div>
    `;
  }
  
  // Add the urgency section if it exists
  if (urgencyHtml.trim() !== '') {
    // Determine the urgency color
    let urgencyColorClass = 'text-gray-700';
    if (urgencyHtml.toLowerCase().includes('high')) {
      urgencyColorClass = 'text-red-600';
    } else if (urgencyHtml.toLowerCase().includes('low')) {
      urgencyColorClass = 'text-green-600';
    }
    
    finalHtml += `
      <div class="mt-3 pt-2 border-t border-zendesk-border">
        <h3 class="font-medium text-sm mb-1">🚨 Ticket Urgency</h3>
        <p class="text-sm ${urgencyColorClass}">${urgencyHtml.trim()}</p>
      </div>
    `;
  }
  
  // Update the UI
  summaryContent.innerHTML = finalHtml;
  summaryResult.classList.remove('hidden');
  summaryActions.classList.remove('hidden');
  emptyState.classList.add('hidden');
}

// Function to show error
function showError(message, debugInfo) {
  // Add helpful context for common errors
  const isOllamaError = message && (
    message.includes('Ollama API error') || 
    message.includes('Failed to get response from Ollama') || 
    message.includes('All Ollama URLs failed') ||
    message.includes('Cannot connect to Ollama server') ||
    message.includes('Invalid response format from Ollama')
  );
  
  // Check for CORS issues
  const isCorsError = debugInfo && (
    (debugInfo.errorMessage && (
      debugInfo.errorMessage.includes('Forbidden') ||
      debugInfo.errorMessage.includes('403') ||
      debugInfo.errorMessage.includes('CORS')
    )) ||
    (debugInfo.errorStack && debugInfo.errorStack.includes('CORS'))
  );
  
  // Check for connection issues
  const isConnectionError = debugInfo && (
    (debugInfo.errorMessage && (
      debugInfo.errorMessage.includes('Failed to fetch') ||
      debugInfo.errorMessage.includes('Network Error') ||
      debugInfo.errorMessage.includes('ERR_CONNECTION_REFUSED')
    )) ||
    message.includes('Cannot connect to Ollama server')
  );
  
  // Check for model issues
  const isModelError = debugInfo && (
    message.includes('Unknown model') ||
    message.includes('model not found') ||
    (debugInfo.modelName && message.toLowerCase().includes(debugInfo.modelName.toLowerCase()))
  );
  
  if (isOllamaError) {
    // Prepare debug info section
    let debugInfoHtml = '';
    if (debugInfo) {
      // Build a user-friendly debug info display
      const debugItems = [];
      
      // Add model name if available
      if (debugInfo.modelName) {
        debugItems.push(`<p>Model: <code>${debugInfo.modelName}</code></p>`);
      }
      
      // Add URLs that were tried
      if (debugInfo.triedUrls && debugInfo.triedUrls.length) {
        debugItems.push(`<p>Tried URLs: <code>${debugInfo.triedUrls.join('</code>, <code>')}</code></p>`);
      }
      
      // Add specific error message if available
      if (debugInfo.errorMessage) {
        debugItems.push(`<p>Error: <code>${debugInfo.errorMessage}</code></p>`);
      }
      
      // Add timestamp
      debugItems.push(`<p class="text-gray-500">Timestamp: ${debugInfo.timestamp || new Date().toISOString()}</p>`);
      
      // Create the HTML
      debugInfoHtml = `
        <div class="mt-3 p-2 bg-gray-100 rounded-md overflow-auto max-h-40 text-xs">
          <p class="font-medium mb-1">Debug Information:</p>
          ${debugItems.join('')}
        </div>
      `;
    }
    
    // Determine the most appropriate troubleshooting steps based on the error type
    let troubleshootingSteps = '';
    
    // If the debugInfo contains suggestions, use those
    if (debugInfo && debugInfo.suggestions && debugInfo.suggestions.length) {
      troubleshootingSteps = `
        <ol class="list-decimal pl-4 mt-1">
          ${debugInfo.suggestions.map(suggestion => `<li>${suggestion}</li>`).join('')}
        </ol>
      `;
    } 
    // Otherwise, use built-in suggestions based on error type
    else if (isCorsError) {
      troubleshootingSteps = `
        <ol class="list-decimal pl-4 mt-1">
          <li>Ensure Ollama is running</li>
          <li>Try using "http://127.0.0.1:11434" instead of "localhost"</li>
          <li><strong>CORS issue detected:</strong> Start Ollama with CORS headers enabled:
            <ul class="list-disc pl-4 mt-1 mb-1">
              <li>Windows: <code>set OLLAMA_ORIGINS=* && ollama serve</code></li>
              <li>Mac/Linux: <code>OLLAMA_ORIGINS=* ollama serve</code></li>
            </ul>
          </li>
          <li>Make sure you've pulled the model with: <code>ollama pull modelname</code></li>
          <li>Check your firewall settings to allow Chrome to access Ollama</li>
        </ol>
      `;
    } else if (isConnectionError) {
      troubleshootingSteps = `
        <ol class="list-decimal pl-4 mt-1">
          <li>Ensure Ollama is running on your computer</li>
          <li>Check that the Ollama URL is correct (default: http://localhost:11434)</li>
          <li>Try using "http://127.0.0.1:11434" instead of "localhost"</li>
          <li>Restart Ollama and try again</li>
          <li>Check your firewall isn't blocking the connection</li>
        </ol>
      `;
    } else if (isModelError) {
      troubleshootingSteps = `
        <ol class="list-decimal pl-4 mt-1">
          <li>Make sure you've downloaded the model with: <code>ollama pull ${debugInfo.modelName || 'modelname'}</code></li>
          <li>Check that the model name is spelled correctly (names are case-sensitive)</li>
          <li>Try using a different model from the dropdown</li>
          <li>If downloading a model, check your disk space</li>
        </ol>
      `;
    } else {
      // Default troubleshooting steps
      troubleshootingSteps = `
        <ol class="list-decimal pl-4 mt-1">
          <li>Ensure Ollama is running</li>
          <li>Try using "http://127.0.0.1:11434" instead of "localhost"</li>
          <li>Make sure you've pulled the model with: <code>ollama pull modelname</code></li>
          <li>Check if your model name is correct (case-sensitive)</li>
          <li>Try clicking the "Test" button to check your connection</li>
        </ol>
      `;
    }
    
    // Create error message with common causes and steps
    errorText.innerHTML = `
      <div class="font-medium">${message}</div>
      <div class="mt-2 text-xs">
        <p>This may be due to:</p>
        <ul class="list-disc pl-4 mt-1">
          ${isConnectionError ? '<li><strong>Ollama not running</strong> on your computer</li>' : '<li>Ollama not running on your computer</li>'}
          ${isModelError ? '<li><strong>The selected model not being available</strong> or not downloaded</li>' : '<li>The selected model not being available</li>'}
          ${isCorsError ? '<li><strong>CORS policy restrictions</strong> preventing Chrome from accessing Ollama</li>' : '<li>Network restrictions preventing access</li>'}
        </ul>
        <p class="mt-2">Troubleshooting steps:</p>
        ${troubleshootingSteps}
      </div>
      ${debugInfoHtml}
    `;
  } else {
    errorText.textContent = message;
  }
  
  errorMessage.classList.remove('hidden');
  
  // Hide loading if it's showing
  hideLoading();
}

// Function to validate settings
function validateSettings(settings) {
  if (!settings.zendeskDomain) {
    showError('Zendesk domain is required in settings');
    showSettings();
    return false;
  }
  
  if (!settings.zendeskEmail) {
    showError('Zendesk email is required in settings');
    showSettings();
    return false;
  }
  
  if (!settings.zendeskToken) {
    showError('Zendesk API token is required in settings');
    showSettings();
    return false;
  }
  
  // When using Ollama, OpenAI API key is not required
  if (!settings.useOllama && !settings.openaiKey) {
    showError('OpenAI API key is required when not using Ollama');
    showSettings();
    return false;
  }
  
  // When using Ollama, validate Ollama settings
  if (settings.useOllama) {
    if (!settings.ollamaUrl) {
      showError('Ollama URL is required when using Ollama');
      showSettings();
      return false;
    }
    
    if (!settings.ollamaModel) {
      showError('Ollama model name is required when using Ollama');
      showSettings();
      return false;
    }
  }
  
  return true;
}

// Function to show settings panel
function showSettings() {
  mainContent.classList.add('hidden');
  settingsPanel.classList.remove('hidden');
}

// Function to hide settings panel
function hideSettings() {
  settingsPanel.classList.add('hidden');
  mainContent.classList.remove('hidden');
}

// Function to show toast message
function showToast(message) {
  toastMessage.textContent = message;
  successToast.classList.remove('hidden');
  
  setTimeout(() => {
    successToast.classList.add('hidden');
  }, 3000);
}

// Function to fetch available Ollama models
async function fetchOllamaModels() {
  // Get the current Ollama URL from the input field
  const ollamaUrlValue = ollamaUrl.value || 'http://localhost:11434';
  
  // Show status
  modelFetchStatus.textContent = 'Fetching models...';
  modelFetchStatus.className = 'mt-1 text-xs text-zendesk-blue';
  modelFetchStatus.classList.remove('hidden');
  
  // Disable button during fetch
  fetchModelsBtn.disabled = true;
  
  try {
    console.log('Requesting Ollama models via background script from', ollamaUrlValue);
    
    // Use the background script to fetch models (avoids CORS issues)
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { 
          action: 'fetchOllamaModels', 
          ollamaUrl: ollamaUrlValue 
        }, 
        (response) => resolve(response)
      );
    });
    
    console.log('Response from background script:', response);
    
    if (response && response.success) {
      // Use the helper function to update the model dropdown
      updateModelDropdown(response.data);
      
      // Show success status
      modelFetchStatus.textContent = `Models fetched successfully`;
      modelFetchStatus.className = 'mt-1 text-xs text-zendesk-success';
      
      // Also update our connection status since models were fetched successfully
      ollamaStatusText.textContent = 'Connected';
      ollamaStatusIndicator.className = 'inline-block w-3 h-3 rounded-full bg-green-500';
      ollamaStatus.classList.remove('opacity-0');
    } else {
      // Error fetching models
      modelFetchStatus.textContent = `Error: ${response?.error || 'Unknown error'}`;
      modelFetchStatus.className = 'mt-1 text-xs text-zendesk-error';
      
      // If we got fallback data in the error response, still try to populate the dropdown
      if (response && response.data) {
        updateModelDropdown(response.data);
        
        // Add a note that these are fallback models
        modelFetchStatus.textContent += ' (showing default models)';
      }
      
      const error = new Error(response?.error || 'Failed to fetch models from Ollama');
      // Add debug info to the error object
      if (response?.debugInfo) {
        error.debugInfo = response.debugInfo;
      }
      
      // Show the full error with debug info in the error message section
      showError(`Failed to fetch Ollama models: ${error.message}`, error.debugInfo);
      
      // Update connection status to show not connected
      ollamaStatusText.textContent = 'Not connected';
      ollamaStatusIndicator.className = 'inline-block w-3 h-3 rounded-full bg-red-500';
      ollamaStatus.classList.remove('opacity-0');
    }
    
    // Re-select the previously saved model if it exists in the list
    chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
      if (response && response.ollamaModel) {
        // Try to find the saved model in the options
        for (let i = 0; i < ollamaModel.options.length; i++) {
          if (ollamaModel.options[i].value === response.ollamaModel) {
            ollamaModel.selectedIndex = i;
            break;
          }
        }
      }
    });
  } catch (error) {
    console.error('Error fetching Ollama models:', error);
    modelFetchStatus.textContent = `Error: ${error.message}`;
    modelFetchStatus.className = 'mt-1 text-xs text-zendesk-error';
    
    // Show the full error with debug info in the error message section
    showError(`Failed to fetch Ollama models: ${error.message}`, error.debugInfo);
    
    // Update connection status to show error
    ollamaStatusText.textContent = 'Error connecting';
    ollamaStatusIndicator.className = 'inline-block w-3 h-3 rounded-full bg-red-500';
    ollamaStatus.classList.remove('opacity-0');
  } finally {
    // Re-enable button
    fetchModelsBtn.disabled = false;
  }
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

// Function to get settings from storage
function getSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
      resolve(response || {});
    });
  });
}

// Function to autofill fields
function autofillFields() {
  // Execute content script to fill the fields in Zendesk
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab || !tab.id) {
      showError('Cannot access the current tab');
      return;
    }
    
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (fields) => {
        // Keep track of what fields were successfully filled
        const filledFields = [];
        
        // Try to find and fill order number field
        if (fields.orderNumber) {
          const orderField = document.querySelector('[data-test-id="ticket-custom-field-order-number"]') || 
                             document.querySelector('#custom_field_order_number') ||
                             document.querySelector('[name="custom_field_order_number"]');
          if (orderField) {
            orderField.value = fields.orderNumber;
            // Trigger change event to update any listeners
            orderField.dispatchEvent(new Event('change', { bubbles: true }));
            filledFields.push('Order number');
          }
        }
        
        // Try to find and fill serial number field
        if (fields.serialNumber) {
          const serialField = document.querySelector('[data-test-id="ticket-custom-field-serial-number"]') ||
                              document.querySelector('#custom_field_serial_number') ||
                              document.querySelector('[name="custom_field_serial_number"]');
          if (serialField) {
            serialField.value = fields.serialNumber;
            serialField.dispatchEvent(new Event('change', { bubbles: true }));
            filledFields.push('Serial number');
          }
        }
        
        // Try to find and fill product field
        if (fields.product) {
          const productField = document.querySelector('[data-test-id="ticket-custom-field-product"]') ||
                               document.querySelector('#custom_field_product') ||
                               document.querySelector('[name="custom_field_product"]');
          if (productField) {
            productField.value = fields.product;
            productField.dispatchEvent(new Event('change', { bubbles: true }));
            filledFields.push('Product');
          }
        }
        
        // Try to find and fill date of purchase field
        if (fields.dateOfPurchase) {
          const dateField = document.querySelector('[data-test-id="ticket-custom-field-purchase-date"]') ||
                            document.querySelector('#custom_field_purchase_date') ||
                            document.querySelector('[name="custom_field_purchase_date"]');
          if (dateField) {
            dateField.value = fields.dateOfPurchase;
            dateField.dispatchEvent(new Event('change', { bubbles: true }));
            filledFields.push('Purchase date');
          }
        }
        
        // Try to find and fill reason for return field
        if (fields.reasonForReturn) {
          const reasonField = document.querySelector('[data-test-id="ticket-custom-field-return-reason"]') ||
                              document.querySelector('#custom_field_return_reason') ||
                              document.querySelector('[name="custom_field_return_reason"]');
          if (reasonField) {
            reasonField.value = fields.reasonForReturn;
            reasonField.dispatchEvent(new Event('change', { bubbles: true }));
            filledFields.push('Return reason');
          }
        }
        
        // Try to fill address field if found in the summary
        if (fields.address) {
          const addressField = document.querySelector('[data-test-id="ticket-custom-field-address"]') ||
                               document.querySelector('#custom_field_address') ||
                               document.querySelector('[name="custom_field_address"]');
          if (addressField) {
            addressField.value = fields.address;
            addressField.dispatchEvent(new Event('change', { bubbles: true }));
            filledFields.push('Address');
          }
        }
        
        // Try to fill description/notes field with the brief summary if available
        if (fields.briefSummary) {
          const descriptionField = document.querySelector('#ticket_comment_body') ||
                                   document.querySelector('[data-test-id="ticket-comment-textarea"]');
          if (descriptionField && !descriptionField.value.trim()) {
            // Only fill if the field is empty
            descriptionField.value = `AI Summary: ${fields.briefSummary}`;
            descriptionField.dispatchEvent(new Event('change', { bubbles: true }));
            filledFields.push('Comment/Description');
          }
        }
        
        return filledFields.length > 0 ? filledFields : null;
      },
      args: [extractedFields]
    }, (results) => {
      if (chrome.runtime.lastError) {
        showError(`Autofill failed: ${chrome.runtime.lastError.message}`);
      } else if (results && results[0] && results[0].result) {
        const filledFields = results[0].result;
        showToast(`Successfully filled: ${filledFields.join(', ')}`);
      } else {
        showToast('No matching fields found to autofill');
      }
    });
  });
}

// Function to update token usage display
async function updateTokenUsageDisplay() {
  try {
    // Get token usage data
    const usageData = await getTokenUsage();
    
    // Show usage in the UI
    if (usageData && tokenUsageElement) {
      // Format the data
      const totalTokens = usageData.totalTokens.toLocaleString();
      const requestCount = usageData.requestCount;
      const formattedDate = usageData.lastRequest ? new Date(usageData.lastRequest).toLocaleDateString() : 'Never';
      
      // Update the UI
      tokenUsageElement.innerHTML = `
        <div class="text-xs text-zendesk-text mt-2 border-t border-zendesk-border pt-2">
          <div class="flex justify-between">
            <span>Total tokens used:</span>
            <span class="font-medium">${totalTokens}</span>
          </div>
          <div class="flex justify-between">
            <span>API requests:</span>
            <span class="font-medium">${requestCount}</span>
          </div>
          <div class="flex justify-between">
            <span>Last request:</span>
            <span class="font-medium">${formattedDate}</span>
          </div>
        </div>
      `;
      
      // Reveal the usage stats
      tokenUsageElement.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Failed to update token usage display:', error);
  }
}

// Function to view detailed token usage
function viewTokenUsageDetails() {
  // Create and show the token usage dialog
  chrome.windows.create({
    url: 'token-usage.html',
    type: 'popup',
    width: 500,
    height: 600
  });
}

// Function to reset token usage stats
async function resetTokenUsage() {
  try {
    chrome.runtime.sendMessage({ action: 'resetTokenUsage' }, () => {
      showToast('Token usage statistics have been reset');
      updateTokenUsageDisplay();
    });
  } catch (error) {
    console.error('Failed to reset token usage:', error);
    showError('Could not reset token usage statistics');
  }
}

// Function to ask follow-up question
async function askFollowupQuestion() {
  const question = followupQuestion.value.trim();
  
  if (!question) {
    showError('Please enter a question first');
    return;
  }
  
  if (!currentTicketId) {
    showError('No ticket data available for follow-up questions');
    return;
  }
  
  // Get settings
  const settings = await getSettings();
  if (!validateSettings(settings)) {
    return;
  }
  
  // Show loading
  askFollowupBtn.disabled = true;
  askFollowupBtn.textContent = 'Processing...';
  followupAnswer.classList.add('hidden');
  errorMessage.classList.add('hidden');
  
  try {
    // Always use cached data if available to avoid making additional API calls
    const cachedData = await getTicketSummaryFromCache(currentTicketId);
    
    if (!cachedData) {
      throw new Error('Please extract ticket information first before asking follow-up questions');
    }
    
    // Use the cached summary as the context for the follow-up question
    const ticketContent = cachedData.summary;
    
    // Prepare the prompt for the follow-up question
    const prompt = `
      You're a helpful assistant analyzing a Zendesk support ticket.
      
      Here is the content of the ticket:
      ${ticketContent}
      
      Now, please answer the following specific question about this ticket:
      ${question}
      
      Provide a concise, direct answer based on the ticket information above. 
      If the question cannot be answered with the available information, explain why.
    `;
    
    // Use Ollama or OpenAI based on settings
    let responseText;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    if (settings.useOllama) {
      console.log('Using Ollama for follow-up question');
      
      // Call Ollama API through background script to avoid CORS issues
      const ollamaResponse = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'queryOllama',
          ollamaUrl: settings.ollamaUrl,
          ollamaModel: settings.ollamaModel || 'llama3',
          prompt: prompt,
          options: {
            temperature: 0.2,
            num_predict: 2048
          }
        }, (response) => resolve(response));
      });
      
      console.log('Ollama response from background script:', ollamaResponse);
      
      if (!ollamaResponse || !ollamaResponse.success) {
        const error = new Error(ollamaResponse?.error || 'Failed to get response from Ollama');
        // Attach debug info to the error object for better error reporting
        if (ollamaResponse?.debugInfo) {
          error.debugInfo = ollamaResponse.debugInfo;
        }
        throw error;
      }
      
      const ollamaData = ollamaResponse.data;
      
      // Log the data we received to help debug
      console.log('Ollama response structure:', Object.keys(ollamaData));
      
      if (!ollamaData.response) {
        console.error('Unexpected Ollama response format:', ollamaData);
        throw new Error('Invalid response from Ollama API - please check the console for details');
      }
      
      responseText = ollamaData.response;
      
      // Estimate token usage for Ollama
      promptTokens = estimatePromptTokens(prompt);
      completionTokens = estimateCompletionTokens(responseText);
      totalTokens = promptTokens + completionTokens;
    } else {
      // Call OpenAI API
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.openaiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 300 // Increased for more comprehensive answers
        })
      });
      
      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        throw new Error(`OpenAI API error (${openaiResponse.status}): ${errorText}`);
      }
      
      const openaiData = await openaiResponse.json();
      
      if (!openaiData.choices || !openaiData.choices[0] || !openaiData.choices[0].message) {
        throw new Error('Invalid response from OpenAI API');
      }
      
      responseText = openaiData.choices[0].message.content;
      
      // Get token usage from OpenAI
      promptTokens = openaiData.usage ? openaiData.usage.prompt_tokens : 0;
      completionTokens = openaiData.usage ? openaiData.usage.completion_tokens : 0;
      totalTokens = openaiData.usage ? openaiData.usage.total_tokens : (promptTokens + completionTokens);
    }
    
    // Display the answer
    followupAnswerText.textContent = responseText.trim();
    followupAnswer.classList.remove('hidden');
    
    // Save token usage data
    chrome.runtime.sendMessage({ 
      action: 'saveTokenUsage',
      usage: {
        ticketId: currentTicketId || 'unknown',
        promptTokens,
        completionTokens,
        totalTokens
      }
    });
    
    // Update the usage display
    updateTokenUsageDisplay();
    
  } catch (error) {
    console.error('Error processing follow-up question:', error);
    // Pass debug info for better error reporting
    showError(error.message || 'Failed to process your question', error.debugInfo);
  } finally {
    // Reset UI
    askFollowupBtn.disabled = false;
    askFollowupBtn.textContent = 'Ask Question';
  }
}

// Function to copy summary to clipboard
function copyToClipboard() {
  const textToCopy = summaryContent.textContent.trim();
  
  if (textToCopy) {
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        // Change button text temporarily
        const originalText = copyBtn.textContent;
        copyBtn.textContent = "Copied!";
        copyBtn.classList.add('bg-gray-100');
        
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.classList.remove('bg-gray-100');
        }, 2000);
      })
      .catch(err => {
        console.error('Could not copy text: ', err);
        showError('Failed to copy to clipboard');
      });
  }
}

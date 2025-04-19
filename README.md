# Muse Assistant
![Muse Assistant Logo](/attached_assets/logo.png)
A Chrome extension that enhances Zendesk support workflows through intelligent AI-powered ticket analysis, providing support agents with streamlined, actionable insights.

## Features

- **Automatic Ticket Analysis**: Extract key information from tickets with a single click
- **AI-Powered Summaries**: Get concise summaries of customer issues using AI
- **Field Extraction**: Automatically identify order numbers, products, serial numbers and more
- **Follow-up Questions**: Ask clarifying questions about the ticket
- **Custom Prompt Templates**: Customize system prompts with variables for better results
- **Privacy Options**: Choose between OpenAI API or local Ollama model for data privacy
- **Token Usage Tracking**: Monitor your API usage
- **Dark Mode Support**: Toggle between light and dark themes for better visibility

## Installation

1. Download the extension files or clone this repository
2. In Chrome, go to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the extension folder
5. The extension icon should appear in your browser toolbar

## Setup

### Zendesk Configuration

1. Click the extension icon and go to Settings
2. Enter your Zendesk domain (e.g., `yourcompany.zendesk.com`)
3. Enter your Zendesk email address
4. Create a Zendesk API token in your Zendesk admin settings and enter it in the extension

### AI Provider Options

#### Option 1: OpenAI API (Cloud-based)

1. Obtain an API key from [OpenAI](https://platform.openai.com/account/api-keys)
2. Enter your OpenAI API key in the Settings tab
3. Make sure the "Use Ollama" option is unchecked

#### Option 2: Ollama (Local, Private)

For enhanced privacy, you can use [Ollama](https://ollama.ai/) to run AI models locally on your computer.

1. Download and install [Ollama](https://ollama.ai/download) for your operating system
2. Pull a model of your choice using the command line:
   ```
   ollama pull llama3
   ```
   (You can replace `llama3` with other models like `llama3:8b`, `phi3`, or `mistral`)
3. In the extension settings, check "Use Ollama"
4. Set the Ollama URL (default: `http://localhost:11434`)
5. Select a model from the dropdown (click "Fetch Models" to see available models)

##### Important: Enabling CORS for Ollama

For security reasons, browsers restrict web extensions from directly accessing local services. To enable the extension to communicate with Ollama, you must start Ollama with special permissions:

**On Mac/Linux:**
```
OLLAMA_ORIGINS=* ollama serve
```

**On Windows (Command Prompt):**
```
set OLLAMA_ORIGINS=* && ollama serve
```

**On Windows (PowerShell):**
```
$env:OLLAMA_ORIGINS="*"; ollama serve
```

## Using the Extension

1. Navigate to a Zendesk ticket page
2. Click the extension icon to open the popup
3. Click "Scan Current Ticket" to detect the ticket
4. Click "Extract Ticket Info" to analyze the ticket with AI
5. View the AI-generated summary and extracted fields
6. (Optional) Ask follow-up questions about the ticket
7. Toggle dark mode in settings for better visibility in different lighting conditions

### Customizing Prompt Templates

The extension allows you to customize the system prompts used for ticket analysis:

1. Click the extension icon and go to Settings
2. Scroll down to the "Prompt Settings" section
3. Edit the template text to customize the AI behavior
4. Use variables like `{{ticketId}}`, `{{tagContext}}`, `{{productModel}}` to reference ticket data
5. Click "Reset to default" to restore the original template if needed
6. Click "Save Settings" to apply your changes

Available variables:
- `{{ticketId}}` - The current ticket ID
- `{{tagContext}}` - Context information from ticket tags
- `{{productModel}}` - Product model from ticket tags
- `{{warrantyStatus}}` - Warranty status if available
- `{{ticketUrgency}}` - Estimated ticket urgency
- `{{ticketContent}}` - Full ticket conversation content

## Troubleshooting

### Ollama Connection Issues

If you see "CORS policy restriction" or "Failed to get response from Ollama" errors:

1. Make sure Ollama is running on your computer
2. Restart Ollama with CORS headers enabled: `OLLAMA_ORIGINS=* ollama serve`
3. Verify the Ollama URL is correct (typically `http://localhost:11434`)
4. Try using `http://127.0.0.1:11434` instead of `localhost`
5. Make sure you've downloaded the selected model with `ollama pull modelname`

### Zendesk API Issues

If you see Zendesk API errors:

1. Verify your Zendesk domain, email and API token are correct
2. Ensure your Zendesk account has API access permissions
3. Check if you're on a valid ticket page

## Privacy & Security Notes

- When using Ollama, all data processing happens locally on your computer
- No ticket data is stored or sent to third parties when using Ollama
- OpenAI API usage is subject to OpenAI's data privacy policies
- The extension caches summaries locally in your browser for improved performance
- API keys and credentials are stored securely in Chrome's synced storage

## Development

This extension uses:
- Chrome Extension Manifest V3
- JavaScript for extension logic
- OpenAI API or Ollama for AI capabilities
- Local browser storage for caching results

## License

[MIT License](LICENSE)

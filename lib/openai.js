/**
 * Language Model API handler
 * Provides functions for generating summaries using OpenAI's API or Ollama
 */

// Using gpt-4o-mini for better cost efficiency as requested by user

// Function to generate a summary from ticket data
async function generateSummary(settings, ticketData, ticketId) {
  try {
    // Extract all customer content from the ticket
    const allContent = getAllTicketContent(ticketData);
    
    // Extract common patterns from the text
    const patterns = extractPatterns(allContent);
    
    // Get product info from tags with full context
    const productContext = ticketData.productInfo || {};
    
    // Format the tag-based context information for use in the prompt
    let tagContextInfo = '';
    
    // Add product model info
    if (productContext.model) {
      tagContextInfo += `- Product model: ${productContext.model}\n`;
    }
    
    // Add hardware components if any
    if (productContext.hardwareComponents && productContext.hardwareComponents.length > 0) {
      tagContextInfo += `- Hardware components mentioned in tags: ${productContext.hardwareComponents.join(', ')}\n`;
    }
    
    // Add software context if any
    if (productContext.softwareContext && productContext.softwareContext.length > 0) {
      tagContextInfo += `- Software context from tags: ${productContext.softwareContext.join(', ')}\n`;
      
      if (productContext.osVersion) {
        tagContextInfo += `- OS version from tags: ${productContext.osVersion}\n`;
      }
    }
    
    // Add issue categories if any
    if (productContext.issueCategories && productContext.issueCategories.length > 0) {
      tagContextInfo += `- Issue categories from tags: ${productContext.issueCategories.join(', ')}\n`;
    }
    
    // Add return/repair status if any
    if (productContext.returnRepairStatus && productContext.returnRepairStatus.length > 0) {
      tagContextInfo += `- Return/repair status from tags: ${productContext.returnRepairStatus.join(', ')}\n`;
    }
    
    // Add support context if any
    if (productContext.supportContext && productContext.supportContext.length > 0) {
      tagContextInfo += `- Support context from tags: ${productContext.supportContext.join(', ')}\n`;
    }
    
    // Add warranty status if any
    if (productContext.warrantyStatus) {
      tagContextInfo += `- Warranty status from tags: ${productContext.warrantyStatus}\n`;
    }
    
    // Get ticket urgency info
    const ticketUrgency = ticketData.ticketUrgency 
      ? `Ticket age: ${ticketData.ticketUrgency.ageInDays} days, Priority: ${ticketData.ticketUrgency.level}` 
      : '';
    
    // Clarify phone vs IMEI
    let phonesAndIMEIs = '';
    if (patterns.phones.length > 0) {
      phonesAndIMEIs += `\nPotential phone numbers detected: ${patterns.phones.join(', ')}`;
    }
    
    // Include any extracted patterns in the prompt context
    let patternsContext = '';
    if (patterns.serialNumbers.length > 0) {
      patternsContext += `Potential serial numbers detected: ${patterns.serialNumbers.join(', ')}\n`;
    }
    
    if (patterns.imeis.length > 0) {
      patternsContext += `Potential IMEI numbers detected: ${patterns.imeis.join(', ')}\n`;
    }
    
    if (patterns.addresses.length > 0) {
      patternsContext += `Potential addresses detected:\n${patterns.addresses.join('\n')}\n`;
    }
    
    // Get the custom prompt template or use default
    let promptTemplate = settings.promptTemplate;
    
    // If no template is provided, use a basic one (should never happen as we ensure default exists)
    if (!promptTemplate) {
      promptTemplate = getDefaultPromptTemplate();
    }
    
    // Prepare variables that can be used in the template
    const variables = {
      ticketId: ticketId || 'Unknown',
      tagContext: tagContextInfo || 'No relevant tags found in the ticket.',
      productModel: productContext.model || 'none found',
      warrantyStatus: productContext.warrantyStatus || 'unknown',
      issueCategories: productContext.issueCategories?.join(', ') || '',
      returnRepairStatus: productContext.returnRepairStatus?.join(', ') || '',
      ticketUrgency: ticketUrgency || 'age, issue severity, and customer impact',
      patternContext: patternsContext || '',
      phoneNumbers: phonesAndIMEIs || '',
      ticketContent: allContent
    };
    
    // Replace variables in the template with their values
    let prompt = promptTemplate;
    
    // Replace {{variable}} patterns in the template
    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`{{${key}}}`, 'g');
      prompt = prompt.replace(pattern, value);
    }
    
    // If the template doesn't include the ticket content, add it
    if (!prompt.includes('ticketContent') && !prompt.includes('allContent')) {
      prompt += `\n\nHere's the ticket content:\n"""\n${allContent}\n"""\n\n${patternsContext}\n${phonesAndIMEIs}`;
    }

    // Use Ollama or OpenAI based on settings
    let responseText;
    let promptTokens;
    let completionTokens;
    let totalTokens;

    if (settings.useOllama) {
      // Call Ollama API through background script to avoid CORS issues
      console.log('Generating summary using Ollama model:', settings.ollamaModel || 'llama3');
      
      // Test connection first to provide better error messages
      try {
        const connectionTestResponse = await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            action: 'fetchOllamaModels',
            ollamaUrl: settings.ollamaUrl
          }, (response) => resolve(response));
        });
        
        if (!connectionTestResponse || !connectionTestResponse.success) {
          const error = new Error('Cannot connect to Ollama server. Please check your connection settings.');
          error.debugInfo = {
            ollamaUrl: settings.ollamaUrl,
            ollamaModel: settings.ollamaModel,
            connectionError: connectionTestResponse?.error,
            triedUrls: connectionTestResponse?.debugInfo?.triedUrls,
            suggestions: [
              "Ensure Ollama is running on your computer",
              "Check the URL in settings (default: http://localhost:11434)",
              "Make sure the model is downloaded with 'ollama pull modelname'",
              "Try restarting Ollama with CORS headers: OLLAMA_ORIGINS=* ollama serve"
            ]
          };
          throw error;
        }
      } catch (connectionError) {
        console.error('Failed to connect to Ollama during pre-check:', connectionError);
        throw connectionError;
      }
      
      // Connection test passed, proceed with generating the summary
      try {
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
        
        console.log('Received response from Ollama background script');
        
        if (!ollamaResponse || !ollamaResponse.success) {
          const error = new Error(ollamaResponse?.error || 'Failed to get response from Ollama');
          // Attach debug info to the error object for UI display
          error.debugInfo = {
            ...ollamaResponse?.debugInfo,
            modelName: settings.ollamaModel,
            requestTimestamp: new Date().toISOString(),
            suggestions: [
              "Ensure the selected model is downloaded with 'ollama pull modelname'",
              "Try a different model from the dropdown",
              "Check that Ollama has sufficient system resources",
              "Restart Ollama and try again"
            ]
          };
          throw error;
        }
        
        const ollamaData = ollamaResponse.data;
        
        // The background script normalizes the response in a standardized format
        // Log the data we received to help debug
        console.log('Ollama response structure:', Object.keys(ollamaData));
        
        if (!ollamaData.response) {
          console.error('Unexpected Ollama response format:', ollamaData);
          const error = new Error('Invalid response format from Ollama API');
          error.debugInfo = {
            receivedData: Object.keys(ollamaData),
            rawData: JSON.stringify(ollamaData).substring(0, 200) + '...',
            expected: 'Expected a "response" property in the data object',
            modelName: settings.ollamaModel
          };
          throw error;
        }
        
        responseText = ollamaData.response;
      } catch (apiError) {
        console.error('Error during Ollama API call:', apiError);
        throw apiError;
      }
      
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
          max_tokens: 300
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
      
      // Get token usage
      promptTokens = openaiData.usage ? openaiData.usage.prompt_tokens : estimatePromptTokens(prompt);
      completionTokens = openaiData.usage ? openaiData.usage.completion_tokens : estimateCompletionTokens(responseText);
      totalTokens = openaiData.usage ? openaiData.usage.total_tokens : (promptTokens + completionTokens);
    }
    
    // Save token usage data
    await saveTokenUsage({
      ticketId: ticketId || 'unknown',
      promptTokens,
      completionTokens,
      totalTokens
    });

    return responseText;
  } catch (error) {
    console.error('Error generating summary:', error);
    // Create a new error that includes the debug info from the original error
    const newError = new Error(`Failed to generate summary: ${error.message}`);
    // Propagate the debug information if it exists
    if (error.debugInfo) {
      newError.debugInfo = error.debugInfo;
    }
    throw newError;
  }
}

// Function to estimate prompt tokens if not provided by the API
function estimatePromptTokens(prompt) {
  // Rough estimation: 1 token ≈ 4 characters
  return Math.ceil(prompt.length / 4);
}

// Function to estimate completion tokens if not provided by the API
function estimateCompletionTokens(completion) {
  // Rough estimation: 1 token ≈ 4 characters
  return Math.ceil(completion.length / 4);
}

// Function to extract structured fields from the summary
function extractFieldsFromSummary(summary) {
  const fields = {};
  
  // Extract the brief summary at the end if present
  let briefSummary = '';
  const summaryLines = summary.split('\n');
  const nonBulletLines = summaryLines.filter(line => !line.startsWith('-') && line.trim() !== '');
  
  if (nonBulletLines.length > 0) {
    // The last non-bullet line is likely the summary
    briefSummary = nonBulletLines[nonBulletLines.length - 1].trim();
    fields.briefSummary = briefSummary;
  }
  
  // Look for order number with more flexible patterns
  const orderPatterns = [
    /order\s*(?:number|#|no|num)?(?:\s*(?::|-)?\s*)([a-z0-9-#]+)/i,  // Standard "Order number: ABC123"
    /\b(?:ord|order|#ord)[:\s-]*([a-z0-9-#]+)/i,                     // #ORD-12345 or similar
    /\border\s+(?:is|was|:)?\s*([a-z0-9-#]+)/i                       // "order is ABC123"
  ];
  
  for (const pattern of orderPatterns) {
    const match = summary.match(pattern);
    if (match) {
      fields.orderNumber = match[1].trim();
      break;
    }
  }
  
  // Look for product name with more flexible patterns
  const productPatterns = [
    /product(?:\s*(?:name|type))?(?:\s*(?::|-)?\s*)([^,.\n]+)/i,              // Standard "Product: XYZ"
    /(?:a|the)\s+([^,.\n]*?(?:phone|model)\s*\d*[^,.\n]*)/i,                  // "a Phone 4" or similar
    /(?:my|using|have)(?:\s+a)?(?:\s+[^,.\n]*)?(?:\s+)(device\s*\d*[^,.\n]*)/i   // "my device" or "using a new device 4"
  ];
  
  for (const pattern of productPatterns) {
    const match = summary.match(pattern);
    if (match) {
      fields.product = match[1].trim();
      break;
    }
  }
  
  // Look for serial number with more flexible patterns
  const serialPatterns = [
    /serial\s*(?:number|#|no|num)?(?:\s*(?::|-)?\s*)([a-z0-9-]+)/i,        // Standard "Serial number: ABC123"
    /\b(?:sn|s\/n|serial)[\s:]*([a-z0-9-]+)/i,                             // SN: ABC123 or similar
    /\b(?:imei|device\s*id|device\s*number)[\s:]*(\d[\d-]+\d)/i            // IMEI or device ID
  ];
  
  for (const pattern of serialPatterns) {
    const match = summary.match(pattern);
    if (match) {
      fields.serialNumber = match[1].trim();
      break;
    }
  }
  
  // Look for date of purchase with more flexible patterns
  const datePatterns = [
    /(?:date of purchase|purchase date|bought on|purchased on|ordered on)(?:\s*(?::|-)?\s*)([^,.\n]+)/i,   // Standard format
    /(?:bought|purchased|ordered|received)(?:\s+it)?(?:\s+on|\s+in|\s+at)(?:\s+the)?(?:\s+)([^,.\n]+)/i,   // "bought it on March 3rd"
    /(?:bought|purchased|ordered|received)(?:\s+in|\s+on)(?:\s+)([a-z]+\s+\d{4})/i,                        // "purchased in January 2023"
    /(?:since|from)\s+([a-z]+\s+\d{4}|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,.]+(?:\d{1,2}[,.\s]+)?\d{4}))/i  // "since March 2023"
  ];
  
  for (const pattern of datePatterns) {
    const match = summary.match(pattern);
    if (match) {
      fields.dateOfPurchase = match[1].trim();
      break;
    }
  }
  
  // Look for reason for return or issue description
  const reasonPatterns = [
    /(?:reason for return|return reason|returning because)(?:\s*(?::|-)?\s*)([^,.\n]+)/i,
    /(?:issue|problem|defect|broken|not working)(?:\s+is|:|\s+-)?(?:\s*)([^,.\n]+)/i,
    /(?:complaint|issue description|error)(?:\s*(?::|-)?\s*)([^,.\n]+)/i
  ];
  
  for (const pattern of reasonPatterns) {
    const match = summary.match(pattern);
    if (match) {
      fields.reasonForReturn = match[1].trim();
      break;
    }
  }
  
  // Look for address information
  const addressPatterns = [
    /address(?:\s*(?::|-)?\s*)([^,]*,.+?\d{4,}[^,.\n]*)/i,  // Standard "Address: 123 Main St, City, 12345"
    /shipping\s+(?:address|to)(?:\s*(?::|-)?\s*)([^,]*,.+?\d{4,}[^,.\n]*)/i,  // "Shipping address: 123 Main St"
    /delivery\s+(?:address|to)(?:\s*(?::|-)?\s*)([^,]*,.+?\d{4,}[^,.\n]*)/i   // "Delivery address: 123 Main St"
  ];
  
  for (const pattern of addressPatterns) {
    const match = summary.match(pattern);
    if (match) {
      fields.address = match[1].trim();
      break;
    }
  }
  
  return fields;
}

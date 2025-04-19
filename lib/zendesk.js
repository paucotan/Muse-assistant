/**
 * Zendesk API handler
 * Provides functions for interacting with the Zendesk API
 */

// Function to fetch ticket comments and ticket details
async function fetchTicketComments(settings, ticketId) {
  try {
    // Format the Zendesk API URL for comments
    const domain = settings.zendeskDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const commentsUrl = `https://${domain}/api/v2/tickets/${ticketId}/comments.json`;
    
    // Create auth token
    const auth = btoa(`${settings.zendeskEmail}/token:${settings.zendeskToken}`);
    
    // Make the API request for comments
    const commentsResponse = await fetch(commentsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!commentsResponse.ok) {
      if (commentsResponse.status === 401) {
        throw new Error('Invalid Zendesk credentials. Please check your settings.');
      } else if (commentsResponse.status === 404) {
        throw new Error(`Ticket #${ticketId} not found. Please check the ticket ID.`);
      } else {
        throw new Error(`Zendesk API error: ${commentsResponse.status} ${commentsResponse.statusText}`);
      }
    }
    
    const commentsData = await commentsResponse.json();
    
    // Now also fetch the ticket details to get additional metadata
    const ticketUrl = `https://${domain}/api/v2/tickets/${ticketId}.json`;
    
    const ticketResponse = await fetch(ticketUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });
    
    let ticketData = null;
    if (ticketResponse.ok) {
      ticketData = await ticketResponse.json();
    }
    
    // Extract custom fields if they exist
    let customFields = {};
    if (ticketData && ticketData.ticket && ticketData.ticket.custom_fields) {
      for (const field of ticketData.ticket.custom_fields) {
        if (field.value) {
          customFields[field.id] = field.value;
        }
      }
    }
    
    // Extract product information from tags if present
    let productInfo = extractProductFromTags(ticketData?.ticket?.tags || []);
    
    // Calculate ticket age and urgency
    let ticketUrgency = calculateTicketUrgency(ticketData?.ticket?.created_at, ticketData?.ticket?.priority);
    
    // Return combined data
    return {
      comments: commentsData.comments,
      ticket: ticketData ? ticketData.ticket : null,
      customFields: customFields,
      productInfo: productInfo,
      ticketUrgency: ticketUrgency
    };
    
  } catch (error) {
    console.error('Error fetching ticket data:', error);
    throw new Error(`Failed to fetch ticket data: ${error.message}`);
  }
}

// Function to extract product and context information from ticket tags
function extractProductFromTags(tags) {
  // Initialize result structure with comprehensive context information
  const contextInfo = {
    // Product identification
    model: null,
    generation: null,
    
    // Issue categorization
    issueCategories: [],
    
    // Hardware components
    hardwareComponents: [],
    
    // Software context
    osVersion: null,
    softwareContext: [],
    
    // Return/repair status
    returnRepairStatus: [],
    
    // Support path categorization
    supportContext: [],
    
    // Warranty status
    warrantyStatus: null,
    
    // Raw tags for debugging
    rawTags: tags || []
  };
  
  if (!tags || !Array.isArray(tags)) {
    return contextInfo;
  }
  
  // --- PRODUCT MODEL DETECTION ---
  
  // Generic product model detection
  // First look for product model tags with format "product-model-X" or "productX"
  const productModelPattern = /^([a-zA-Z]+)[_\-]?(\d+)$/i;
  
  for (const tag of tags) {
    // Check for product model tags (e.g., phone-model-5, phone5)
    const modelMatch = tag.match(productModelPattern);
    if (modelMatch) {
      const brand = modelMatch[1].charAt(0).toUpperCase() + modelMatch[1].slice(1).toLowerCase();
      contextInfo.model = `${brand} ${modelMatch[2]}`;
      contextInfo.generation = modelMatch[2];
      break;
    }
  }
  
  // Fallback to specific product model keyword search if no direct match
  // Organizations can customize this to match their specific product naming
  if (!contextInfo.model) {
    // This is just an example - organizations should modify this to match their product naming
    if (tags.includes('model-a')) {
      contextInfo.model = 'Model A';
      contextInfo.generation = 'A';
    } else if (tags.includes('model-b')) {
      contextInfo.model = 'Model B';
      contextInfo.generation = 'B';
    } else if (tags.includes('model-c')) {
      contextInfo.model = 'Model C';
      contextInfo.generation = 'C';
    }
  }
  
  // --- ISSUE CATEGORIZATION ---
  
  // Common hardware issue categories
  const hardwareIssueTags = [
    'screen', 'display', 'battery', 'charging', 'usb', 'usb-c', 'camera', 'speaker', 
    'microphone', 'buttons', 'power-button', 'volume-buttons', 'headphone-jack', 
    'sim', 'sim-tray', 'sd-card', 'wifi', 'bluetooth', 'nfc', 'sensors'
  ];
  
  // Common software issue categories
  const softwareIssueTags = [
    'software', 'os', 'update', 'android', 'app', 'apps', 'crash', 'reboot', 
    'bootloop', 'frozen', 'slow', 'performance', 'settings', 'permissions'
  ];
  
  // Specific issue categories
  const specificIssueTags = {
    'physical-damage': 'Physical damage',
    'water-damage': 'Water damage',
    'won\'t-turn-on': 'Won\'t turn on',
    'won\'t-charge': 'Won\'t charge',
    'overheating': 'Overheating',
    'performance': 'Performance issues',
    'battery-drain': 'Battery drain',
    'connectivity': 'Connectivity issues'
  };
  
  // Extract issue categories from tags
  for (const tag of tags) {
    // Hardware issues
    if (hardwareIssueTags.includes(tag)) {
      contextInfo.issueCategories.push(tag.charAt(0).toUpperCase() + tag.slice(1).replace(/-/g, ' '));
      contextInfo.hardwareComponents.push(tag.replace(/-/g, ' '));
    }
    
    // Software issues
    if (softwareIssueTags.includes(tag)) {
      contextInfo.issueCategories.push(tag.charAt(0).toUpperCase() + tag.slice(1).replace(/-/g, ' '));
      contextInfo.softwareContext.push(tag.replace(/-/g, ' '));
    }
    
    // Specific named issues
    if (tag in specificIssueTags) {
      contextInfo.issueCategories.push(specificIssueTags[tag]);
    }
    
    // OS version detection
    const androidMatch = tag.match(/^android-(\d+(?:\.\d+)*)$/i);
    if (androidMatch) {
      contextInfo.osVersion = `Android ${androidMatch[1]}`;
      contextInfo.softwareContext.push(`Android ${androidMatch[1]}`);
    }
  }
  
  // --- RETURN/REPAIR STATUS ---
  
  // Common return/repair status tags
  const returnRepairTags = {
    'return-requested': 'Return requested',
    'return-approved': 'Return approved',
    'return-in-progress': 'Return in progress',
    'repair-requested': 'Repair requested',
    'repair-approved': 'Repair approved',
    'repair-in-progress': 'Repair in progress',
    'warranty-claim': 'Warranty claim',
    'rma': 'Return Merchandise Authorization',
    'refund-requested': 'Refund requested',
    'refund-approved': 'Refund approved',
    'refund-processed': 'Refund processed',
    'replacement': 'Replacement requested'
  };
  
  for (const tag of tags) {
    if (tag in returnRepairTags) {
      contextInfo.returnRepairStatus.push(returnRepairTags[tag]);
    }
  }
  
  // --- SUPPORT CONTEXT ---
  
  // Support path categorization
  const supportContextTags = {
    'first-contact': 'First contact',
    'follow-up': 'Follow-up contact',
    'escalated': 'Escalated case',
    'urgent': 'Urgent case',
    'high-priority': 'High priority',
    'pre-sales': 'Pre-sales inquiry',
    'post-sales': 'Post-sales support',
    'technical': 'Technical support',
    'billing': 'Billing support',
    'shipping': 'Shipping inquiry',
    'question': 'General question',
    'feedback': 'User feedback'
  };
  
  for (const tag of tags) {
    if (tag in supportContextTags) {
      contextInfo.supportContext.push(supportContextTags[tag]);
    }
  }
  
  // --- WARRANTY STATUS ---
  
  // Warranty status tags
  if (tags.includes('in-warranty')) {
    contextInfo.warrantyStatus = 'In warranty';
  } else if (tags.includes('out-of-warranty')) {
    contextInfo.warrantyStatus = 'Out of warranty';
  } else if (tags.includes('warranty-expired')) {
    contextInfo.warrantyStatus = 'Warranty expired';
  } else if (tags.includes('extended-warranty')) {
    contextInfo.warrantyStatus = 'Extended warranty';
  }
  
  return contextInfo;
}

// Function to calculate ticket urgency based on age and priority
function calculateTicketUrgency(createdAt, priority) {
  // Default values
  let urgency = {
    level: 'normal',
    ageInDays: 0,
    isOld: false,
    description: 'Normal priority'
  };
  
  if (!createdAt) {
    return urgency;
  }
  
  // Calculate age in days
  const ticketDate = new Date(createdAt);
  const currentDate = new Date();
  const ageInMs = currentDate.getTime() - ticketDate.getTime();
  const ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));
  
  urgency.ageInDays = ageInDays;
  
  // Set urgency based on age and priority
  if (ageInDays > 7) {
    urgency.isOld = true;
    urgency.level = 'high';
    urgency.description = `High priority - Ticket is ${ageInDays} days old`;
  } else if (priority === 'urgent' || priority === 'high') {
    urgency.level = 'high';
    urgency.description = 'High priority - Marked as urgent in Zendesk';
  } else if (priority === 'low') {
    urgency.level = 'low';
    urgency.description = 'Low priority';
  } else {
    // Default normal urgency
    if (ageInDays > 3) {
      urgency.description = `Normal priority - Ticket is ${ageInDays} days old`;
    }
  }
  
  return urgency;
}

// Function to find all relevant customer comments and details
function getAllTicketContent(ticketData) {
  let allContent = '';
  
  // Include ticket subject if available
  if (ticketData.ticket && ticketData.ticket.subject) {
    allContent += `Ticket Subject: ${ticketData.ticket.subject}\n\n`;
  }
  
  // Include ticket description/initial comment if available
  if (ticketData.comments && ticketData.comments.length > 0) {
    // The first comment is usually the ticket description
    allContent += `Initial Description: ${ticketData.comments[0].body}\n\n`;
    
    // Add all subsequent customer comments
    const customerComments = ticketData.comments.filter(comment => 
      comment.public && 
      !comment.via?.source?.rel?.includes('trigger') &&
      comment.id !== ticketData.comments[0].id // Skip the first comment as we already included it
    );
    
    if (customerComments.length > 0) {
      allContent += "Additional Customer Comments:\n";
      for (const comment of customerComments) {
        allContent += `---\n${comment.body}\n`;
      }
    }
  }
  
  return allContent;
}

// Function to find the most relevant customer comment
function findCustomerComment(comments) {
  if (!comments || comments.length === 0) {
    return null;
  }
  
  // Sort comments by created_at, newest first
  const sortedComments = [...comments].sort((a, b) => {
    return new Date(b.created_at) - new Date(a.created_at);
  });
  
  // First try to find a public comment, most likely from customer
  for (const comment of sortedComments) {
    // Skip internal/agent notes
    if (comment.public && !comment.via?.source?.rel?.includes('trigger')) {
      return comment;
    }
  }
  
  // If no public comment is found, use the first comment as fallback
  // This is likely the initial ticket request
  return sortedComments[sortedComments.length - 1];
}

// Function to extract patterns from text like serial numbers, addresses, etc.
function extractPatterns(text) {
  const patterns = {
    serialNumbers: [],
    imeis: [],
    addresses: [],
    emails: [],
    phones: []
  };
  
  // First check for phone number context to avoid confusing them with IMEIs or serial numbers
  const phoneContextRegex = /(?:(?:phone|telephone|contact|call|mobile)(?:\s+(?:me|at|on|number|#))?(?:\s*(?::|is|at|=)?\s*)|my\s+number\s+is\s*(?::|-)?\s*)((?:\+?\d{1,3}[-\s]?)?\(?\d{3,4}\)?[-\s]?\d{3,4}[-\s]?\d{3,4})/gi;
  const phoneContextMatches = [...text.matchAll(phoneContextRegex)];
  const contextPhones = phoneContextMatches.map(match => match[1].trim());
  
  // IMEI pattern (15 digits) but exclude numbers clearly identified as phone numbers
  const imeiPattern = /\b\d{15}\b/g;
  const imeiMatches = text.match(imeiPattern);
  if (imeiMatches) {
    // Filter out any IMEIs that are actually identified as phone numbers
    patterns.imeis = [...new Set(imeiMatches.filter(imei => 
      !contextPhones.some(phone => phone.includes(imei))
    ))];
  }
  
  // Specific IMEI context pattern
  const imeiContextRegex = /(?:imei|device\s+id|serial)(?:\s*(?::|number|#|is|=)?\s*)(\d{15})/gi;
  const imeiContextMatches = [...text.matchAll(imeiContextRegex)];
  if (imeiContextMatches.length > 0) {
    const contextImeis = imeiContextMatches.map(match => match[1].trim());
    patterns.imeis = [...new Set([...patterns.imeis, ...contextImeis])];
  }
  
  // Serial number patterns (alphanumeric with possible dashes/spaces)
  // Looking for patterns that are clearly identified as serial numbers
  const serialContextRegex = /(?:serial\s*(?:number|#|no|num)?|s\/n|device\s+id)(?:\s*(?::|is|=)?\s*)([a-z0-9][-a-z0-9\s]{6,25}[a-z0-9])/gi;
  const serialContextMatches = [...text.matchAll(serialContextRegex)];
  if (serialContextMatches.length > 0) {
    patterns.serialNumbers = [...new Set(serialContextMatches.map(match => match[1].trim()))];
  }
  
  // Fallback serial pattern for standalone strings that look like serial numbers
  const serialPattern = /\b(?:[A-Z0-9]{4,}[-\s]?){2,}\b/g;
  const serialMatches = text.match(serialPattern);
  if (serialMatches) {
    // Filter out anything that looks like an IMEI or phone number
    const filteredSerials = serialMatches.filter(s => 
      !s.match(/^\d{15}$/) && // Not an IMEI
      !contextPhones.some(phone => phone.includes(s)) && // Not identified as phone
      s.length >= 8 && 
      s.length <= 30
    );
    
    patterns.serialNumbers = [...new Set([...patterns.serialNumbers, ...filteredSerials])];
  }
  
  // Email pattern
  const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const emailMatches = text.match(emailPattern);
  if (emailMatches) {
    patterns.emails = [...new Set(emailMatches)];
  }
  
  // Get phone numbers from the contextual matches we found earlier
  if (contextPhones.length > 0) {
    patterns.phones = [...new Set(contextPhones)];
  } else {
    // Fallback phone pattern if no contextual matches were found
    const phonePattern = /\b(?:\+\d{1,3}[-\s]?)?\(?\d{3,4}\)?[-\s]?\d{3,4}[-\s]?\d{3,4}\b/g;
    const phoneMatches = text.match(phonePattern);
    if (phoneMatches) {
      // Filter out IMEIs which are 15 digits exactly
      patterns.phones = [...new Set(phoneMatches.filter(p => !p.replace(/\D/g, '').match(/^\d{15}$/)))];
    }
  }
  
  // Address detection - look for address context first
  const addressContextRegex = /(?:(?:shipping|delivery|billing|home|my)\s+address|address\s+is|send\s+(?:it|this)\s+to|live\s+(?:at|in))(?:\s*(?::|=|is)?\s*)([^:,.]{10,100}(?:[.,]\s*[a-z0-9][^:,.]{5,30}){1,3})/gi;
  const addressContextMatches = [...text.matchAll(addressContextRegex)];
  if (addressContextMatches.length > 0) {
    patterns.addresses = [...new Set(addressContextMatches.map(match => match[1].trim()))];
  }
  
  // Fallback address pattern - look for postal code patterns
  if (patterns.addresses.length === 0) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Look for postal code patterns
      if (line.match(/\b\d{4,6}(?:[-\s][A-Z]{2})?\b/i) && 
          (line.length > 10 && line.length < 100) && 
          (line.match(/street|ave|road|boulevard|lane|drive|place|court|square|st\.|rd\.|dr\.|pl\.|apt|app|avenue/i))) {
        
        // Collect a few lines before and after as part of the address
        const addressLines = [];
        for (let j = Math.max(0, i-2); j <= Math.min(lines.length-1, i+2); j++) {
          if (lines[j].trim().length > 3 && lines[j].trim().length < 100) {
            addressLines.push(lines[j].trim());
          }
        }
        
        if (addressLines.length > 0) {
          patterns.addresses.push(addressLines.join(', '));
        }
      }
    }
  }
  
  return patterns;
}

// This script runs in the context of Zendesk pages

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTicketId') {
    // Try to extract ticket ID from the URL or page content
    const ticketId = extractTicketIdFromPage();
    sendResponse({ ticketId });
    return true;
  }
});

// Function to extract ticket ID from the current page
function extractTicketIdFromPage() {
  // First try to get it from URL
  const urlMatch = window.location.href.match(/\/tickets\/(\d+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }
  
  // If that fails, try looking for it in the page content
  // This will depend on the specific Zendesk implementation
  
  // Look for common ticket ID elements
  const ticketIdElement = document.querySelector('[data-ticket-id]');
  if (ticketIdElement && ticketIdElement.getAttribute('data-ticket-id')) {
    return ticketIdElement.getAttribute('data-ticket-id');
  }
  
  // Look for ticket ID in breadcrumbs
  const breadcrumbs = document.querySelectorAll('.breadcrumbs a');
  for (const crumb of breadcrumbs) {
    const match = crumb.href.match(/\/tickets\/(\d+)/);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  // Look for ticket ID in header
  const header = document.querySelector('h2.ticket-header');
  if (header) {
    const match = header.textContent.match(/#(\d+)/);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

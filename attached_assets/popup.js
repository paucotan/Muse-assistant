document.getElementById("summarizeBtn").addEventListener("click", async () => {
  const ticketId = document.getElementById("ticketId").value;
  const summaryDiv = document.getElementById("summary");
  summaryDiv.textContent = "Summarizing...";

  const { summary, fields } = await fetchSummary(ticketId);
  summaryDiv.textContent = summary;

  document.getElementById("fillBtn").style.display = "block";
  document.getElementById("fillBtn").onclick = () => autofillFields(fields);
});

async function fetchSummary(ticketId) {
  const zendeskDomain = "yourdomain.zendesk.com";
  const zendeskToken = "your_zendesk_token";
  const email = "your_email";
  const auth = btoa(`${email}/token:${zendeskToken}`);

  const ticketResponse = await fetch(`https://${zendeskDomain}/api/v2/tickets/${ticketId}/comments.json`, {
    headers: {
      "Authorization": `Basic ${auth}`
    }
  });

  const data = await ticketResponse.json();
  const customerComment = data.comments.find(c => !c.via.channel.includes("web") && !c.public === false);

  const prompt = `
Extract the following from this customer message:
- Order number
- Product
- Serial number
- Date of purchase
- Reason for return

Message:
"\${customerComment.body}"
`;

  const chatResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer your_openai_key`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    })
  });

  const gptData = await chatResponse.json();
  const summaryText = gptData.choices[0].message.content;

  return {
    summary: summaryText,
    fields: extractFields(summaryText)
  };
}

function extractFields(text) {
  const fields = {};
  fields.order = text.match(/Order #:\s*(.+)/)?.[1];
  fields.serial = text.match(/Serial #:\s*(.+)/)?.[1];
  fields.product = text.match(/Product:\s*(.+)/)?.[1];
  return fields;
}

function autofillFields(fields) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (fields) => {
        document.querySelector("[data-test-id='custom_field_order']").value = fields.order;
        document.querySelector("[data-test-id='custom_field_serial']").value = fields.serial;
      },
      args: [fields]
    });
  });
}
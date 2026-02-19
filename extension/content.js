// ── AP story scraper ──────────────────────────────────────────

function scrapeStory() {
  // Headline
  const headline =
    document.querySelector('h1.Page-headline') ||
    document.querySelector('h1[data-key="card-headline"]') ||
    document.querySelector('h1');
  const headlineText = headline?.innerText?.trim() || '';

  // Body paragraphs — AP wraps article text in .RichTextStoryBody or similar
  const selectors = [
    '.RichTextStoryBody p',
    '.Article p',
    '[data-key="article-body"] p',
    'article p',
  ];

  let paragraphs = [];
  for (const sel of selectors) {
    paragraphs = Array.from(document.querySelectorAll(sel))
      .map(p => p.innerText?.trim())
      .filter(t => t && t.length > 40);
    if (paragraphs.length >= 3) break;
  }

  const bodyText = paragraphs.slice(0, 12).join('\n\n');
  return { headline: headlineText, body: bodyText };
}

// ── OpenAI call ───────────────────────────────────────────────

async function generateMessage(key, headline, body) {
  const systemPrompt = `You are an editorial assistant for The Associated Press. Your task is to generate a contextual "Why Support This Story" donation message that will appear alongside a specific news article.

RULES — follow every rule precisely:
1. Base the message ONLY on the content provided. Do not introduce external facts.
2. Do not use urgency language ("act now", "last chance", "limited time").
3. Do not imply AP is the only source covering this story.
4. Maintain a calm, factual, nonpartisan tone consistent with AP editorial standards.
5. Do not exaggerate stakes or use emotional manipulation.
6. Do not reference political parties, politicians, or advocacy positions.
7. support_headline must be 10 words or fewer.
8. support_body must be 2-3 sentences on the civic or public-service value of this reporting.
9. tone must be exactly one of: informational, investigative, community, explainer.

Respond with ONLY valid JSON. No markdown, no explanation.

Output schema:
{
  "support_headline": "string",
  "support_body": "string",
  "cta_label": "string",
  "tone": "string"
}`;

  const userPrompt = `Headline: ${headline}\n\nArticle text:\n${body.slice(0, 4000)}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${res.status}`);
  }

  const json = await res.json();
  const raw  = json.choices?.[0]?.message?.content;
  if (!raw) throw new Error('No content returned from API');
  return JSON.parse(raw);
}

// ── Inject widget into page ───────────────────────────────────

function injectWidget(data) {
  // Remove any existing widget
  document.getElementById('ap-support-box-ext')?.remove();

  const DONATE_URL = 'https://apnews.com/donate?target=button?pre-selected%3Dtrue&payment-type=Monthly&payment-price=10';

  const box = document.createElement('div');
  box.id = 'ap-support-box-ext';
  box.innerHTML = `
    <div class="apsb-inner">
      <div class="apsb-top">
        <div class="apsb-badge">AP</div>
        <span class="apsb-kicker">Why Support This Story</span>
      </div>
      <div class="apsb-body">
        <p class="apsb-headline">${escHtml(data.support_headline)}</p>
        <p class="apsb-text">${escHtml(data.support_body)}</p>
      </div>
      <div class="apsb-footer">
        <a class="apsb-cta" href="${DONATE_URL}" target="_blank" rel="noopener">
          ${escHtml(data.cta_label || 'Support This Reporting')}
        </a>
        <span class="apsb-tone">${escHtml(data.tone || '')}</span>
      </div>
      <button class="apsb-close" aria-label="Close">✕</button>
    </div>
  `;

  box.querySelector('.apsb-close').addEventListener('click', () => box.remove());

  // Find best insertion point within the article
  const targets = [
    '.RichTextStoryBody',
    '[data-key="article-body"]',
    '.Article',
    'article',
    'main',
  ];

  let inserted = false;
  for (const sel of targets) {
    const container = document.querySelector(sel);
    if (!container) continue;

    // Insert after the 4th paragraph for a mid-article feel
    const paras = container.querySelectorAll('p');
    if (paras.length >= 4) {
      paras[3].after(box);
    } else if (paras.length > 0) {
      paras[paras.length - 1].after(box);
    } else {
      container.prepend(box);
    }
    inserted = true;
    break;
  }

  if (!inserted) {
    // Fallback: fixed overlay in bottom-right
    box.classList.add('apsb-overlay');
    document.body.appendChild(box);
  }

  // Scroll smoothly into view
  setTimeout(() => box.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Message listener ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'GENERATE') return;

  const { key } = msg;
  const { headline, body } = scrapeStory();

  if (!headline && !body) {
    sendResponse({ error: 'Could not extract article content from this page.' });
    return true;
  }

  generateMessage(key, headline, body)
    .then(data => {
      injectWidget(data);
      sendResponse({ ok: true });
    })
    .catch(err => {
      sendResponse({ error: err.message });
    });

  return true; // keep message channel open for async
});

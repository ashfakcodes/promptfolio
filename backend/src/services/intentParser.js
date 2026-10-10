import 'dotenv/config';
import axios from 'axios';
import { registryDiscoveryService } from './registryDiscoveryService.js';

export class IntentParserService {
  getApiKey() {
    return (process.env.OPENROUTER_API_KEY || '').trim();
  }

  getModel() {
    return (process.env.OPENROUTER_MODEL || 'inclusionai/ling-3.0-flash').trim();
  }

  /**
   * Deterministic check for sectors/assets completely outside the bStocks universe
   */
  detectUnavailableSector(prompt) {
    const p = (prompt || '').toLowerCase();
    const unsupportedKeywords = [
      {
        pattern: /\b(military|militaries|weapon|weapons|defense|defence|war|missile|missiles|arms|lockheed|raytheon|general dynamics|northrop|boeing defense)\b/i,
        name: 'Military Equipment & Defense',
        examples: 'Lockheed Martin, Raytheon, General Dynamics, Northrop Grumman'
      },
      {
        pattern: /\b(biotech|pharmaceutical|pharma|drug|pfizer|moderna|eli lilly|healthcare)\b/i,
        name: 'Pharmaceuticals & Biotechnology',
        examples: 'Pfizer, Eli Lilly, Moderna, Johnson & Johnson'
      },
      {
        pattern: /\b(real estate|reit|property|housing|mortgage)\b/i,
        name: 'Real Estate & REITs',
        examples: 'Prologis, American Tower, Realty Income'
      },
      {
        pattern: /\b(oil|petroleum|natural gas|exxon|chevron|drilling|fossil fuel)\b/i,
        name: 'Oil, Gas & Fossil Energy',
        examples: 'ExxonMobil, Chevron, ConocoPhillips'
      },
      {
        pattern: /\b(commercial bank|banking|jpmorgan|goldman|credit card|wells fargo|citigroup)\b/i,
        name: 'Traditional Commercial Banking',
        examples: 'JPMorgan Chase, Bank of America, Goldman Sachs'
      },
      {
        pattern: /\b(airline|aerospace commercial|delta|united airlines|airways)\b/i,
        name: 'Airlines & Commercial Aviation',
        examples: 'Delta Air Lines, United Airlines'
      }
    ];

    for (const check of unsupportedKeywords) {
      if (check.pattern.test(p)) {
        return check;
      }
    }
    return null;
  }

  detectRequestedAssetCount(prompt) {
    const p = (prompt || '').toLowerCase();
    const wordNumbers = { 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10 };
    
    const digitMatch = p.match(/\b([1-9]|1[0-2])\s*(?:tokenized\s*)?(?:us\s*)?(?:stocks|equities|assets|companies|tokens|bstocks)\b/i);
    if (digitMatch && digitMatch[1]) {
      return parseInt(digitMatch[1], 10);
    }

    const wordMatch = p.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:tokenized\s*)?(?:us\s*)?(?:stocks|equities|assets|companies|tokens|bstocks)\b/i);
    if (wordMatch && wordMatch[1] && wordNumbers[wordMatch[1]]) {
      return wordNumbers[wordMatch[1]];
    }

    return null;
  }

  detectWeightingStrategy(prompt) {
    const p = (prompt || '').toLowerCase();
    if (/\b(equal(?:ly)?\s*weight(?:ed)?|equal\s*weight|even\s*split|evenly\s*(?:distributed|weighted|allocated)|1\s*\/\s*n)\b/i.test(p)) {
      return 'EQUAL_WEIGHT';
    }
    if (/\b(min(?:imum)?\s*vol(?:atility)?|lowest\s*vol(?:atility)?|volatility\s*minimi[zs]ation|least\s*volatile|min\s*variance|risk\s*parity)\b/i.test(p)) {
      return 'MIN_VOLATILITY';
    }
    if (/\b(market\s*cap|cap\s*weight(?:ed)?)\b/i.test(p)) {
      return 'MARKET_CAP';
    }
    return 'AUTO';
  }

  detectPortfolioBounds(prompt) {
    const p = (prompt || '').toLowerCase();
    let maxWeight = null;
    let minWeight = null;

    const maxMatch = p.match(/(?:no\s*more\s*than|maximum(?:\s*of)?|max(?:\s*of)?|capped?\s*at|ceiling(?:\s*of)?|not\s*exceed(?:ing)?|at\s*most)\s*(\d+(?:\.\d+)?)\s*%/i);
    if (maxMatch && maxMatch[1]) {
      maxWeight = parseFloat(maxMatch[1]) / 100;
    }

    const minMatch = p.match(/(?:at\s*least|minimum(?:\s*of)?|min(?:\s*of)?|floor(?:\s*of)?|no\s*less\s*than)\s*(\d+(?:\.\d+)?)\s*%/i);
    if (minMatch && minMatch[1]) {
      minWeight = parseFloat(minMatch[1]) / 100;
    }

    return { maxWeight, minWeight };
  }

  /**
   * Parse conversational prompt into structured ETF allocation,
   * dynamically querying the active bStocks registry.
   */
  async parseIntent(prompt, chainId = 97) {
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      throw new Error('Please provide a valid investment thesis or prompt.');
    }

    // 1. Pre-flight Deterministic Guardrail Check: Reject out-of-universe themes
    const unavailableSector = this.detectUnavailableSector(prompt);
    if (unavailableSector) {
      console.log(`[IntentParser] [GUARDRAIL_HALT] Detected out-of-universe sector: "${unavailableSector.name}"`);
      return {
        status: 'UNSUPPORTED_THEME',
        error: 'SECTOR_NOT_FOUND',
        missingSector: unavailableSector.name,
        message: `No tokenized ${unavailableSector.name} equities (such as ${unavailableSector.examples}) are currently minted or verified on BNB Smart Chain.`,
        suggestedThemes: [
          'Artificial Intelligence & Semiconductors (bNVDA, bTSMC)',
          'Big Tech Platforms (bAAPL, bMSFT, bGOOGL, bAMZN)',
          'Crypto Financial Infrastructure (bCOIN, bMSTR)',
          'US Sovereign Debt Yield Hedging (bTBILL)'
        ],
        engine: 'Promptfolio Attestation Guardrail'
      };
    }

    const apiKey = this.getApiKey();
    const model = this.getModel();
    const activeCatalog = await registryDiscoveryService.getActiveBStocks(chainId);

    console.log(`[IntentParser] Processing prompt on Chain ${chainId}: "${prompt}"`);
    console.log(`[IntentParser] Active bStocks available in registry: ${activeCatalog.length}`);

    const candidateModels = [
      model,
      'google/gemini-2.0-flash-001',
      'meta-llama/llama-3.3-70b-instruct'
    ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

    const weightingStrategy = this.detectWeightingStrategy(prompt);
    const { maxWeight, minWeight } = this.detectPortfolioBounds(prompt);
    const requestedAssetCount = this.detectRequestedAssetCount(prompt);

    if (apiKey) {
      for (const targetModel of candidateModels) {
        try {
          console.log(`[IntentParser] Dispatching request to OpenRouter API (${targetModel})...`);
          const llmResult = await this.parseWithOpenRouter(prompt, apiKey, targetModel, activeCatalog);
          if (llmResult) {
            if (llmResult.status === 'UNSUPPORTED_THEME') {
              console.log(`[IntentParser] [REJECTED_BY_LLM] Out-of-universe sector flagged: "${llmResult.missingSector}"`);
              return {
                ...llmResult,
                engine: `OpenRouter AI (${targetModel})`
              };
            }
            if (llmResult.allocations && llmResult.allocations.length > 0) {
              console.log(`[IntentParser] [SUCCESS] OpenRouter LLM synthesis successful! Produced ${llmResult.allocations.length} bStocks:`, llmResult.allocations.map(a => `${a.symbol} (${a.weight}%)`).join(', '));
              return {
                ...llmResult,
                weightingStrategy: llmResult.weightingStrategy || weightingStrategy,
                maxWeightConstraint: llmResult.maxWeightConstraint !== undefined ? llmResult.maxWeightConstraint : maxWeight,
                minWeightConstraint: llmResult.minWeightConstraint !== undefined ? llmResult.minWeightConstraint : minWeight,
                requestedAssetCount: llmResult.requestedAssetCount || requestedAssetCount,
                engine: `OpenRouter AI (${targetModel})`
              };
            }
          }
        } catch (err) {
          const errMsg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
          console.warn(`[IntentParser] OpenRouter attempt (${targetModel}) notice:`, errMsg);
        }
      }
    }

    console.log('[IntentParser] Executing local deterministic quant rule engine fallback...');
    const ruleResult = this.parseWithRuleEngine(prompt, activeCatalog);
    return {
      ...ruleResult,
      weightingStrategy: ruleResult.weightingStrategy || weightingStrategy,
      maxWeightConstraint: ruleResult.maxWeightConstraint !== undefined ? ruleResult.maxWeightConstraint : maxWeight,
      minWeightConstraint: ruleResult.minWeightConstraint !== undefined ? ruleResult.minWeightConstraint : minWeight,
      requestedAssetCount: ruleResult.requestedAssetCount || requestedAssetCount,
      engine: 'Promptfolio Quant Rule Engine (Offline/Local)'
    };
  }

  async parseWithOpenRouter(prompt, apiKey, model, activeCatalog) {
    const catalogSummary = activeCatalog.map(s => 
      `- Symbol: ${s.symbol}, Name: ${s.name}, Underlying: ${s.underlyingTicker} (${s.underlyingCompany || ''}), Sector: ${s.sector}, Tags: ${(s.tags || []).join(', ')}`
    ).join('\n');

    const systemPrompt = `You are Promptfolio AI, an expert quant portfolio manager for BNB Smart Chain tokenized equities (bStocks).
Available bStocks catalog:
${catalogSummary}

Analyze the user's investment prompt and generate a thematic ETF allocation.
Rules:
1. ONLY select valid symbols from the bStocks catalog: ${activeCatalog.map(s => s.symbol).join(', ')}.
2. Weights MUST be positive numbers summing to exactly 100.
3. If the user explicitly asks for specific assets or percentages (e.g. "30% US Treasury yield", "Nvidia, Apple, TSMC"), strictly honor those allocations.
4. If the prompt specifies a requested number of assets (e.g. "5 tokenized US stocks", "4 stocks"), you MUST return EXACTLY that number of bStocks.
5. If the prompt specifies a weighting strategy (e.g. "equal weighted", "equally weighted", "even split"), you MUST assign equal weights (e.g. 20.0% each for 5 assets, 25.0% each for 4 assets).
6. If the prompt specifies a maximum cap (e.g. "no more than 25% in any single company"), ensure NO single allocation exceeds that percentage.
7. If the prompt mentions a theme (e.g. "AI infrastructure", "Big Tech", "Crypto", "High Yield"), select the most appropriate bStocks.
8. STRICT ASSET & SECTOR AVAILABILITY VALIDATION (CRITICAL):
   If the user's requested core industry, theme, or companies (for example: military equipment, defense contractors, weapons, biotechnology, pharmaceuticals, commercial real estate, oil & gas, mining, traditional retail banking) are NOT authentic bStocks in the catalog, DO NOT FORCE AN ALLOCATION OR SUBSTITUTE UNRELATED BIG TECH OR AUTOMOTIVE COMPANIES (such as selecting Amazon, Tesla, or Nvidia for military equipment).
   Instead, you MUST respond with this exact rejection JSON:
   {
     "status": "UNSUPPORTED_THEME",
     "missingSector": "Name of unavailable sector/theme requested",
     "message": "No tokenized equities in this sector are currently minted or verified on BNB Smart Chain.",
     "suggestedThemes": [
       "Artificial Intelligence & Semiconductors (bNVDA, bTSMC)",
       "Big Tech Platforms (bAAPL, bMSFT, bGOOGL, bAMZN)",
       "Crypto Financial Infrastructure (bCOIN, bMSTR)",
       "US Sovereign Debt Yield Hedging (bTBILL)"
     ]
   }

If the theme IS supported, respond with a valid JSON object in this exact format (no markdown formatting, no other text):
{
  "status": "SUCCESS",
  "etfName": "Short descriptive ETF Name (e.g. AI Hardware Alpha ETF)",
  "ticker": "PROMPT-XXXX",
  "thesis": "1-2 sentence compelling summary of the investment thesis and risk posture",
  "riskRating": "LOW" | "MEDIUM" | "HIGH" | "VERY HIGH",
  "allocations": [
    {
      "symbol": "bNVDA",
      "weight": 35.0,
      "role": "Primary compute & AI driver"
    }
  ]
}`;

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://promptfolio.bnbchain.org',
          'X-Title': 'Promptfolio ETF Synthesizer',
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    const rawContent = response.data?.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error('Empty response content received from OpenRouter API');
    }

    const parsed = this.extractJsonFromResponse(rawContent);
    if (!parsed) {
      throw new Error('Could not parse JSON response from OpenRouter API');
    }

    // Check if LLM explicitly identified an unsupported sector
    if (parsed.status === 'UNSUPPORTED_THEME' || parsed.error === 'SECTOR_NOT_FOUND') {
      return {
        status: 'UNSUPPORTED_THEME',
        missingSector: parsed.missingSector || 'Requested Sector',
        message: parsed.message || `No tokenized ${parsed.missingSector || 'requested'} equities are currently minted or verified on BNB Smart Chain.`,
        suggestedThemes: parsed.suggestedThemes || [
          'Artificial Intelligence & Semiconductors (bNVDA, bTSMC)',
          'Big Tech Platforms (bAAPL, bMSFT, bGOOGL, bAMZN)',
          'Crypto Financial Infrastructure (bCOIN, bMSTR)',
          'US Sovereign Debt Yield Hedging (bTBILL)'
        ]
      };
    }

    if (!parsed.allocations) {
      throw new Error('Parsed response does not contain valid allocations array');
    }

    // Validate symbols against active catalog
    const validAllocations = [];
    const explicitConstraints = {};

    for (const item of parsed.allocations || []) {
      const match = activeCatalog.find(
        s => s.symbol.toUpperCase() === (item.symbol || '').toUpperCase() ||
             s.underlyingTicker?.toUpperCase() === (item.symbol || '').toUpperCase()
      );
      if (match) {
        const parsedWeight = Math.max(1, Number(item.weight) || 10);
        validAllocations.push({
          symbol: match.symbol,
          name: match.name,
          weight: parsedWeight,
          role: item.role || match.sector
        });

        // Check if user explicitly mentioned a percentage for this asset in the raw prompt
        const constraintCheck = this.extractExplicitConstraint(prompt, match.symbol, match.underlyingTicker);
        if (constraintCheck !== null) {
          explicitConstraints[match.symbol] = constraintCheck;
        }
      }
    }

    if (validAllocations.length === 0) {
      throw new Error('LLM did not produce valid bStock symbols from catalog');
    }

    const weightingStrategy = this.detectWeightingStrategy(prompt);
    const { maxWeight, minWeight } = this.detectPortfolioBounds(prompt);
    const requestedAssetCount = this.detectRequestedAssetCount(prompt);

    // If equal-weighting is requested, enforce strictly across allocations
    if (weightingStrategy === 'EQUAL_WEIGHT' && validAllocations.length > 0) {
      const fixedSymbols = Object.keys(explicitConstraints);
      const fixedWeightSum = Object.values(explicitConstraints).reduce((a, b) => a + b, 0);
      const freeAllocations = validAllocations.filter(a => !fixedSymbols.includes(a.symbol));
      const remainingWeight = Math.max(0, 100 - fixedWeightSum);
      const equalShare = freeAllocations.length > 0 ? Number((remainingWeight / freeAllocations.length).toFixed(1)) : 0;

      let curSum = 0;
      freeAllocations.forEach((item, idx) => {
        if (idx === freeAllocations.length - 1) {
          item.weight = Number((remainingWeight - curSum).toFixed(1));
        } else {
          item.weight = equalShare;
          curSum += equalShare;
        }
      });
      validAllocations.forEach(item => {
        if (explicitConstraints[item.symbol] !== undefined) {
          item.weight = explicitConstraints[item.symbol];
        }
      });
    }

    return {
      status: 'SUCCESS',
      etfName: parsed.etfName || 'Custom Dynamic bStock ETF',
      ticker: parsed.ticker || `PF-${Math.floor(1000 + Math.random() * 9000)}`,
      thesis: parsed.thesis || 'Algorithmic multi-asset bStocks basket synthesized on BNB Chain.',
      riskRating: parsed.riskRating || 'MEDIUM',
      allocations: validAllocations,
      explicitConstraints,
      weightingStrategy,
      maxWeightConstraint: maxWeight,
      minWeightConstraint: minWeight,
      requestedAssetCount
    };
  }

  /**
   * Helper to parse JSON from raw text or markdown code fences
   */
  extractJsonFromResponse(text) {
    if (typeof text !== 'string') return null;
    const clean = text.trim();

    try {
      return JSON.parse(clean);
    } catch (_) {}

    const codeFenceMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeFenceMatch && codeFenceMatch[1]) {
      try {
        return JSON.parse(codeFenceMatch[1].trim());
      } catch (_) {}
    }

    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(clean.substring(firstBrace, lastBrace + 1));
      } catch (_) {}
    }

    return null;
  }

  /**
   * Local deterministic quant rule engine for instant offline execution
   */
  parseWithRuleEngine(prompt, activeCatalog) {
    const unavailableSector = this.detectUnavailableSector(prompt);
    if (unavailableSector) {
      return {
        status: 'UNSUPPORTED_THEME',
        error: 'SECTOR_NOT_FOUND',
        missingSector: unavailableSector.name,
        message: `No tokenized ${unavailableSector.name} equities (such as ${unavailableSector.examples}) are currently minted or verified on BNB Smart Chain.`,
        suggestedThemes: [
          'Artificial Intelligence & Semiconductors (bNVDA, bTSMC)',
          'Big Tech Platforms (bAAPL, bMSFT, bGOOGL, bAMZN)',
          'Crypto Financial Infrastructure (bCOIN, bMSTR)',
          'US Sovereign Debt Yield Hedging (bTBILL)'
        ]
      };
    }

    const p = prompt.toLowerCase();
    const allocations = [];
    const explicitConstraints = {};

    for (const stock of activeCatalog) {
      const symPattern = new RegExp(`\\b${stock.symbol}\\b`, 'i');
      const tickerPattern = new RegExp(`\\b${stock.underlyingTicker}\\b`, 'i');
      const cleanCompanyWord = (stock.underlyingCompany || stock.name || '').replace(/[,\.]/g, '').split(' ')[0];
      const namePattern = cleanCompanyWord ? new RegExp(`\\b${cleanCompanyWord}\\b`, 'i') : null;

      const isMentioned = 
        symPattern.test(p) ||
        tickerPattern.test(p) ||
        (namePattern && namePattern.test(p)) ||
        (stock.symbol === 'bTBILL' && /\b(treasury|treasuries|tbill|yield|hedged|bonds)\b/i.test(p)) ||
        (stock.symbol === 'bTSMC' && /\b(tsmc|taiwan semi)\b/i.test(p));

      if (isMentioned) {
        const weight = this.extractExplicitConstraint(prompt, stock.symbol, stock.underlyingTicker);
        if (weight !== null) {
          explicitConstraints[stock.symbol] = weight;
        }

        allocations.push({
          symbol: stock.symbol,
          name: stock.name,
          rawWeight: weight,
          role: stock.sector
        });
      }
    }

    const requestedCount = this.detectRequestedAssetCount(prompt);
    const weightingStrategy = this.detectWeightingStrategy(prompt);
    const { maxWeight, minWeight } = this.detectPortfolioBounds(prompt);

    // Preset thematic fallback if nothing matched
    if (allocations.length === 0) {
      if (requestedCount && requestedCount > 0) {
        // Pick requestedCount diverse US equities (exclude TBILL unless hedged/safe requested)
        const equities = activeCatalog.filter(s => s.symbol !== 'bTBILL');
        const selected = equities.slice(0, requestedCount);
        selected.forEach(s => {
          allocations.push({
            symbol: s.symbol,
            name: s.name,
            rawWeight: null,
            role: s.sector
          });
        });
      } else if (p.includes('ai') || p.includes('infra') || p.includes('compute')) {
        allocations.push(
          { symbol: 'bNVDA', name: 'NVIDIA Tokenized Stock', rawWeight: null, role: 'AI GPU Compute' },
          { symbol: 'bAAPL', name: 'Apple Inc Tokenized Stock', rawWeight: null, role: 'Edge AI Devices' },
          { symbol: 'bTSMC', name: 'TSMC Tokenized Stock', rawWeight: null, role: 'Silicon Foundry' },
          { symbol: 'bTBILL', name: 'Short-Term US Treasury Yield', rawWeight: null, role: 'Treasury Hedge' }
        );
      } else if (p.includes('crypto') || p.includes('btc') || p.includes('bitcoin')) {
        allocations.push(
          { symbol: 'bMSTR', name: 'MicroStrategy Tokenized Stock', rawWeight: null, role: 'Leveraged BTC Proxy' },
          { symbol: 'bCOIN', name: 'Coinbase Tokenized Stock', rawWeight: null, role: 'Crypto Exchange Rails' },
          { symbol: 'bTBILL', name: 'Short-Term US Treasury Yield', rawWeight: null, role: 'Yield Stabilization' }
        );
      } else if (p.includes('mag') || p.includes('titan') || p.includes('big tech')) {
        allocations.push(
          { symbol: 'bNVDA', name: 'NVIDIA Tokenized Stock', rawWeight: null, role: 'AI Leader' },
          { symbol: 'bMSFT', name: 'Microsoft Tokenized Stock', rawWeight: null, role: 'Cloud Platform' },
          { symbol: 'bAAPL', name: 'Apple Inc Tokenized Stock', rawWeight: null, role: 'Consumer Tech' },
          { symbol: 'bGOOGL', name: 'Alphabet Tokenized Stock', rawWeight: null, role: 'Search & LLM' }
        );
      } else {
        allocations.push(
          { symbol: 'bNVDA', name: 'NVIDIA Tokenized Stock', rawWeight: null, role: 'AI Compute' },
          { symbol: 'bAAPL', name: 'Apple Inc Tokenized Stock', rawWeight: null, role: 'Hardware & OS' },
          { symbol: 'bTSMC', name: 'TSMC Tokenized Stock', rawWeight: null, role: 'Foundry Fabricator' },
          { symbol: 'bTBILL', name: 'Short-Term US Treasury Yield', rawWeight: null, role: 'Yield Cushion' }
        );
      }
    }

    // If fewer assets than requested were identified, fill with top US equities from catalog
    if (requestedCount && allocations.length < requestedCount) {
      const existingSymbols = new Set(allocations.map(a => a.symbol));
      const pool = activeCatalog.filter(s => !existingSymbols.has(s.symbol) && s.symbol !== 'bTBILL');
      while (allocations.length < requestedCount && pool.length > 0) {
        const next = pool.shift();
        allocations.push({
          symbol: next.symbol,
          name: next.name,
          rawWeight: null,
          role: next.sector
        });
      }
    }

    const totalExplicit = allocations.filter(a => a.rawWeight !== null).reduce((sum, a) => sum + a.rawWeight, 0);
    const unassigned = allocations.filter(a => a.rawWeight === null);
    
    let remaining = Math.max(0, 100 - totalExplicit);
    const evenShare = unassigned.length > 0 ? remaining / unassigned.length : 0;

    let curSum = 0;
    const finalAllocations = allocations.map((a, i) => {
      let w;
      if (a.rawWeight !== null) {
        w = a.rawWeight;
      } else {
        const isLastUnassigned = i === allocations.length - 1 || unassigned[unassigned.length - 1] === a;
        w = isLastUnassigned ? Number((remaining - curSum).toFixed(1)) : Number(evenShare.toFixed(1));
        curSum += Number(evenShare.toFixed(1));
      }
      return {
        symbol: a.symbol,
        name: a.name,
        weight: w,
        role: a.role
      };
    });

    return {
      status: 'SUCCESS',
      etfName: this.generateEtfName(prompt, finalAllocations),
      ticker: `PF-${Math.floor(1000 + Math.random() * 9000)}`,
      thesis: `Synthesized on-chain strategy targeting ${finalAllocations.map(a => a.symbol).join(', ')} with automated BNB Chain execution.`,
      riskRating: this.estimateRisk(finalAllocations),
      allocations: finalAllocations,
      explicitConstraints,
      weightingStrategy,
      maxWeightConstraint: maxWeight,
      minWeightConstraint: minWeight,
      requestedAssetCount: requestedCount
    };
  }

  extractExplicitConstraint(prompt, symbol, ticker) {
    const p = prompt.toLowerCase();
    const sym = (symbol || '').toLowerCase();
    const tick = (ticker || '').toLowerCase();

    const patterns = [
      new RegExp(`(\\d{1,3}(?:\\.\\d+)?)\\s*%?\\s*(?:in|of)?\\s*${tick}`, 'i'),
      new RegExp(`${tick}\\s*(?:at)?\\s*(\\d{1,3}(?:\\.\\d+)?)\\s*%?`, 'i'),
      new RegExp(`(\\d{1,3}(?:\\.\\d+)?)\\s*%?\\s*(?:in|of)?\\s*${sym}`, 'i')
    ];

    if (symbol === 'bTBILL') {
      patterns.push(new RegExp(`(\\d{1,3}(?:\\.\\d+)?)\\s*%\\s*(?:us treasury|treasury|yield|hedged|bonds)`, 'i'));
    }

    for (const pat of patterns) {
      const match = p.match(pat);
      if (match && match[1]) {
        return parseFloat(match[1]);
      }
    }
    return null;
  }

  generateEtfName(prompt, allocations) {
    const p = prompt.toLowerCase();
    if (p.includes('ai') || p.includes('infra')) return 'AI Infrastructure Alpha ETF';
    if (p.includes('crypto') || p.includes('btc')) return 'Digital Asset Equity Proxy ETF';
    if (p.includes('titan') || p.includes('mag')) return 'Magnificent Tech Titans ETF';
    if (p.includes('yield') || p.includes('safe') || p.includes('hedge')) return 'Hedging & Capital Preservation ETF';
    return `${allocations[0]?.symbol.replace('b', '') || 'Synthesized'} Core Dynamic ETF`;
  }

  estimateRisk(allocations) {
    let hasTBILL = allocations.some(a => a.symbol === 'bTBILL');
    let hasHighBeta = allocations.some(a => a.symbol === 'bCOIN' || a.symbol === 'bMSTR' || a.symbol === 'bTSLA');
    if (hasHighBeta && !hasTBILL) return 'VERY HIGH';
    if (hasHighBeta && hasTBILL) return 'HIGH';
    if (hasTBILL && allocations.length > 2) return 'MEDIUM';
    return 'MEDIUM-HIGH';
  }
}

export const intentParserService = new IntentParserService();

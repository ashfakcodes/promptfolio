/**
 * Promptfolio — Interactive Landing Page Introduction Script
 * Handles typewriter demos, interactive SVG pipeline highlights, preset switcher, and Chart.js.
 */

const DEMO_PRESETS = [
  {
    prompt: "Build an AI-infrastructure basket of Nvidia, Apple, and TSMC, hedged with 30% US Treasury yield",
    title: "AI Infrastructure + Yield",
    allocations: [
      { name: "Nvidia", symbol: "bNVDA", weight: 30, color: "#FF6B35" },
      { name: "Apple", symbol: "bAAPL", weight: 25, color: "#1993f8" },
      { name: "TSMC", symbol: "bTSMC", weight: 20, color: "#10B981" },
      { name: "Treasuries", symbol: "bTBILL", weight: 25, color: "#FFDE21" }
    ],
    gasSlippage: "$0.12",
    totalCost: "$500.12"
  },
  {
    prompt: "Create a high-beta crypto proxy basket of MicroStrategy and Coinbase hedged with 30% Treasuries",
    title: "Crypto Proxies + Hedge",
    allocations: [
      { name: "MicroStrategy", symbol: "bMSTR", weight: 40, color: "#8B5CF6" },
      { name: "Coinbase", symbol: "bCOIN", weight: 30, color: "#06B6D4" },
      { name: "Treasuries", symbol: "bTBILL", weight: 30, color: "#FFDE21" }
    ],
    gasSlippage: "$0.09",
    totalCost: "$500.09"
  },
  {
    prompt: "Synthesize a Magnificent Tech Titans basket of Microsoft, Apple, Nvidia, and Alphabet",
    title: "Mag 7 Tech Titans",
    allocations: [
      { name: "Nvidia", symbol: "bNVDA", weight: 25, color: "#FF6B35" },
      { name: "Microsoft", symbol: "bMSFT", weight: 25, color: "#1993f8" },
      { name: "Apple", symbol: "bAAPL", weight: 25, color: "#10B981" },
      { name: "Alphabet", symbol: "bGOOGL", weight: 25, color: "#EC4899" }
    ],
    gasSlippage: "$0.14",
    totalCost: "$500.14"
  }
];

let currentPresetIndex = 0;
let isTyping = false;
let typewriterTimer = null;
let chartInstance = null;

// DOM Elements
const typeWriterElement = document.querySelector(".prompt-typewriter");
const allocSpanContainer = document.querySelector(".eo-allocations-text");
const sngSpan = document.querySelector(".eo-sng span");
const totalCostSpan = document.querySelector(".eo-total-cost span");
const chipButtons = document.querySelectorAll(".intro-chip");

// Pipeline Stages
const stageIntent = document.querySelector(".rb-item2");
const stageFetcher = document.querySelector(".rb-item4");
const stageQuant = document.querySelector(".rb-item7");
const stageSim = document.querySelector(".rb-item5");

document.addEventListener("DOMContentLoaded", () => {
  initIntroChart();
  setupIntroEvents();
  loadPreset(0, true);
});

function setupIntroEvents() {
  chipButtons.forEach((btn, idx) => {
    btn.addEventListener("click", () => {
      chipButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      loadPreset(idx, true);
    });
  });
}

function initIntroChart() {
  const ctx = document.querySelector(".allocation-chart");
  if (!ctx) return;

  const preset = DEMO_PRESETS[0];
  chartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: preset.allocations.map(a => a.name),
      datasets: [{
        data: preset.allocations.map(a => a.weight),
        backgroundColor: preset.allocations.map(a => a.color),
        borderWidth: 2,
        borderColor: "#1C1C1C"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "65%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            font: { family: "Outfit", size: 12, weight: "600" },
            boxWidth: 12,
            padding: 8
          }
        }
      }
    }
  });
}

async function loadPreset(index, animated = true) {
  currentPresetIndex = index;
  const preset = DEMO_PRESETS[index];

  // Update receipt CTA link with active preset prompt
  const execBtn = document.querySelector('.eo-exec-btn');
  if (execBtn) {
    execBtn.href = `app.html?prompt=${encodeURIComponent(preset.prompt)}`;
  }

  // Update Receipt Text
  if (allocSpanContainer) {
    allocSpanContainer.innerHTML = preset.allocations
      .map(a => `<span>${a.name} - ${a.weight}%</span>`)
      .join(" ");
  }
  if (sngSpan) sngSpan.textContent = preset.gasSlippage;
  if (totalCostSpan) totalCostSpan.textContent = preset.totalCost;

  // Update Chart
  if (chartInstance) {
    chartInstance.data.labels = preset.allocations.map(a => a.name);
    chartInstance.data.datasets[0].data = preset.allocations.map(a => a.weight);
    chartInstance.data.datasets[0].backgroundColor = preset.allocations.map(a => a.color);
    chartInstance.update();
  }

  // Animate Typewriter & Stage illumination
  if (animated) {
    await animateTypewriter(preset.prompt);
    await animatePipelineFlow();
  } else {
    typeWriterElement.textContent = preset.prompt;
  }
}

function animateTypewriter(text) {
  return new Promise(resolve => {
    if (typewriterTimer) clearTimeout(typewriterTimer);
    typeWriterElement.textContent = "";
    let charIdx = 0;

    function typeChar() {
      if (charIdx < text.length) {
        typeWriterElement.textContent += text.charAt(charIdx);
        charIdx++;
        typewriterTimer = setTimeout(typeChar, 18);
      } else {
        resolve();
      }
    }
    typeChar();
  });
}

async function animatePipelineFlow() {
  const steps = [
    { el: stageIntent, delay: 250 },
    { el: stageFetcher, delay: 250 },
    { el: stageSim, delay: 250 },
    { el: stageQuant, delay: 250 }
  ];

  // Reset all
  steps.forEach(s => s.el?.classList.remove("flow-active"));

  // Sequential illumination
  for (const s of steps) {
    if (s.el) {
      s.el.classList.add("flow-active");
      await new Promise(r => setTimeout(r, s.delay));
    }
  }

  // Keep lit briefly then gently pulse
  setTimeout(() => {
    steps.forEach(s => s.el?.classList.remove("flow-active"));
  }, 1500);
}

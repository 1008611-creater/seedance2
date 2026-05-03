const VALID_CODES = new Set(["WEEK-SEED-2026", "VIP-720P-7D", "FREEWEEK"]);
const STORAGE_KEY = "seedance-weekcard-layout-01";
const POSTERS = [
  "assets/poster-beach.svg",
  "assets/poster-city.svg",
  "assets/poster-forest.svg",
  "assets/poster-mountain.svg",
  "assets/poster-product.svg",
  "assets/poster-fashion.svg",
];

const initialState = {
  memberUntil: defaultExpiry(),
  quota: 2,
  mode: "text",
  jobs: [
    {
      id: "queued-1",
      title: "海边的女孩",
      status: "waiting",
      progress: 0,
      ratio: "16:9",
      poster: "assets/poster-beach.svg",
      createdAt: "排队中",
    },
    {
      id: "running-1",
      title: "雨夜的城市街道",
      status: "running",
      progress: 32,
      ratio: "16:9",
      poster: "assets/poster-city.svg",
      createdAt: "生成中",
    },
    {
      id: "waiting-2",
      title: "森林中的晨雾",
      status: "waiting",
      progress: 0,
      ratio: "16:9",
      poster: "assets/poster-forest.svg",
      createdAt: "等待中",
    },
  ],
  gallery: [
    {
      id: "sample-1",
      title: "海边的女孩",
      poster: "assets/poster-beach.svg",
      createdAt: "2025-05-24 14:30",
    },
    {
      id: "sample-2",
      title: "雨夜的城市街道",
      poster: "assets/poster-city.svg",
      createdAt: "2025-05-24 14:18",
    },
    {
      id: "sample-3",
      title: "森林中的晨雾",
      poster: "assets/poster-forest.svg",
      createdAt: "2025-05-23 09:42",
    },
    {
      id: "sample-4",
      title: "雪山日出短时",
      poster: "assets/poster-mountain.svg",
      createdAt: "2025-05-22 18:12",
    },
    {
      id: "sample-5",
      title: "透明耳机广告",
      poster: "assets/poster-product.svg",
      createdAt: "2025-05-22 10:36",
    },
    {
      id: "sample-6",
      title: "时装棚拍光影",
      poster: "assets/poster-fashion.svg",
      createdAt: "2025-05-21 16:20",
    },
  ],
};

let state = loadState();
let timer = null;

const els = {
  accessForm: document.querySelector("#accessForm"),
  code: document.querySelector("#codeInput"),
  claim: document.querySelector("#claimButton"),
  notice: document.querySelector("#notice"),
  prompt: document.querySelector("#promptInput"),
  charCount: document.querySelector("#charCount"),
  quickFill: document.querySelector("#quickFillButton"),
  clearPrompt: document.querySelector("#clearPromptButton"),
  generationForm: document.querySelector("#generationForm"),
  ratio: document.querySelector("#ratioInput"),
  style: document.querySelector("#styleInput"),
  segments: document.querySelectorAll(".segment"),
  quotaText: document.querySelector("#quotaText"),
  quotaInline: document.querySelector("#quotaInline"),
  quotaArc: document.querySelector("#quotaArc"),
  memberUntilText: document.querySelector("#memberUntilText"),
  sideMemberState: document.querySelector("#sideMemberState"),
  refreshQuota: document.querySelector("#refreshQuotaButton"),
  jobList: document.querySelector("#jobList"),
  gallery: document.querySelector("#galleryGrid"),
  clear: document.querySelector("#clearButton"),
};

function defaultExpiry() {
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);
  return expires.toISOString();
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return structuredClone(initialState);
    return { ...structuredClone(initialState), ...saved };
  } catch {
    return structuredClone(initialState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(value))
    .replaceAll("/", "-");
}

function isMemberActive() {
  return new Date(state.memberUntil) > new Date();
}

function showNotice(message, type = "success") {
  els.notice.hidden = false;
  els.notice.textContent = message;
  els.notice.className = `notice ${type === "error" ? "error" : ""}`;
  window.clearTimeout(showNotice.timeout);
  showNotice.timeout = window.setTimeout(() => {
    els.notice.hidden = true;
  }, 2800);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}

function statusText(status) {
  if (status === "running") return "生成中";
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  return "排队中";
}

function renderQuota() {
  const active = isMemberActive();
  const quota = active ? Math.max(0, Math.min(2, state.quota)) : 0;
  const offset = 176 - (quota / 2) * 176;
  els.quotaText.textContent = String(quota);
  els.quotaInline.textContent = String(quota);
  els.quotaArc.style.strokeDashoffset = String(offset);
  els.sideMemberState.textContent = active ? "生效中" : "已过期";
  els.memberUntilText.textContent = `有效期至 ${formatDateTime(state.memberUntil)}`;
}

function renderSegments() {
  els.segments.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });
}

function renderJobs() {
  els.jobList.innerHTML = state.jobs
    .slice(0, 4)
    .map((job) => {
      const status = statusText(job.status);
      const statusClass = job.status === "running" ? "running" : job.status === "waiting" ? "waiting" : "";
      return `
        <article class="queue-item">
          <img src="${job.poster}" alt="${escapeHTML(job.title)}" />
          <div class="queue-copy">
            <strong>${escapeHTML(job.title)}</strong>
            <span>15s｜720p｜${escapeHTML(job.ratio)}</span>
          </div>
          <div class="queue-status ${statusClass}">${status}</div>
          <div class="queue-progress"><span style="width: ${job.progress || 0}%"></span></div>
        </article>
      `;
    })
    .join("");
}

function renderGallery() {
  if (!state.gallery.length) {
    els.gallery.innerHTML = `<div class="empty-state">暂无成片</div>`;
    return;
  }

  els.gallery.innerHTML = state.gallery
    .slice(0, 6)
    .map(
      (item) => `
        <article class="gallery-card">
          <div class="thumb">
            <img src="${item.poster}" alt="${escapeHTML(item.title)}" />
            <span class="play-mark"><i data-lucide="play"></i></span>
            <span class="duration-mark">00:15</span>
          </div>
          <h3>${escapeHTML(item.title)}</h3>
          <p>720p　16:9　${escapeHTML(item.createdAt)}</p>
        </article>
      `,
    )
    .join("");
}

function renderCharCount() {
  els.charCount.textContent = String(els.prompt.value.length);
}

function render() {
  renderQuota();
  renderSegments();
  renderJobs();
  renderGallery();
  renderCharCount();
  saveState();
  if (window.lucide) window.lucide.createIcons();
}

function redeem(event) {
  event.preventDefault();
  const code = els.code.value.trim().toUpperCase();
  if (!VALID_CODES.has(code)) {
    showNotice("卡密无效，演示可用 WEEK-SEED-2026。", "error");
    return;
  }

  state.memberUntil = defaultExpiry();
  state.quota = 2;
  showNotice("兑换成功，周卡权益已激活。");
  render();
}

function claimWeekCard() {
  state.memberUntil = defaultExpiry();
  state.quota = 2;
  showNotice("免费周卡已领取，今天可生成 2 次。");
  render();
}

function submitGeneration(event) {
  event.preventDefault();
  if (!isMemberActive()) {
    showNotice("周卡未生效，请先领取或兑换卡密。", "error");
    return;
  }
  if (state.quota <= 0) {
    showNotice("今日 2 次额度已用完，明天 00:00 自动重置。", "error");
    return;
  }

  const title = (els.prompt.value.trim() || "未命名视频").slice(0, 22);
  const job = {
    id: crypto.randomUUID(),
    title,
    status: "running",
    progress: 8,
    ratio: els.ratio.value,
    poster: POSTERS[(state.jobs.length + state.gallery.length) % POSTERS.length],
    createdAt: "刚刚提交",
  };

  state.quota -= 1;
  state.jobs.unshift(job);
  showNotice("任务已提交，额度已锁定。");
  render();
  startTicker();
}

function startTicker() {
  if (timer) return;
  timer = window.setInterval(() => {
    let hasActive = false;
    const completed = [];

    state.jobs = state.jobs.map((job) => {
      if (job.status !== "running") return job;
      hasActive = true;
      const progress = Math.min(100, job.progress + Math.ceil(Math.random() * 15));
      if (progress >= 100) {
        completed.push(job);
        return { ...job, progress: 100, status: "completed", createdAt: "已完成" };
      }
      return { ...job, progress };
    });

    completed.forEach((job) => {
      state.gallery.unshift({
        id: job.id,
        title: job.title,
        poster: job.poster,
        createdAt: "刚刚",
      });
    });

    if (!hasActive || !state.jobs.some((job) => job.status === "running")) {
      window.clearInterval(timer);
      timer = null;
    }

    render();
  }, 1200);
}

function quickFill() {
  const prompts = [
    "雨夜城市街道，一位穿黑色风衣的角色走过霓虹灯牌，镜头缓慢跟随，地面积水反射光影，电影感，稳定运镜。",
    "森林晨雾中，阳光穿过高大的树木，一只鹿从草地上轻轻穿过，远景转中景，安静自然，柔和光影。",
    "雪山日出，登山者站在山脊上回望镜头，云海缓慢流动，金色阳光洒在雪面，史诗感，画面稳定。",
  ];
  els.prompt.value = prompts[Math.floor(Math.random() * prompts.length)];
  renderCharCount();
}

function clearPrompt() {
  els.prompt.value = "";
  renderCharCount();
}

function clearQueue() {
  state.jobs = [];
  window.clearInterval(timer);
  timer = null;
  render();
}

els.accessForm.addEventListener("submit", redeem);
els.claim.addEventListener("click", claimWeekCard);
els.generationForm.addEventListener("submit", submitGeneration);
els.quickFill.addEventListener("click", quickFill);
els.clearPrompt.addEventListener("click", clearPrompt);
els.prompt.addEventListener("input", renderCharCount);
els.clear.addEventListener("click", clearQueue);
els.refreshQuota.addEventListener("click", () => {
  state.quota = 2;
  showNotice("演示额度已刷新为 2 次。");
  render();
});
els.segments.forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    render();
  });
});

render();
startTicker();

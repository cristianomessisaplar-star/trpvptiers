/**
 * TR PvP TierList - Main App JS
 * Discord botunun API'sından gerçek veri çeker.
 * Bot çalışırken: http://localhost:3001/api/players
 */

const API_URL = "http://localhost:3001/api/players";

// ── Tier puanları ─────────────────────────────────────────────────────────
const TIER_SCORES = {
    HT1: 10, LT1: 9,
    HT2: 8,  LT2: 7,
    HT3: 6,  LT3: 5,
    HT4: 4,  LT4: 3,
    HT5: 2,  LT5: 1
};

const MODE_LABELS = {
    sword:     "Sword",
    axe:       "Axe",
    mace:      "Mace",
    uhc:       "UHC",
    pot:       "Pot",
    nethpot:   "NethOP",
    smp:       "SMP",
    vanilla:   "Vanilla",
    spearmace: "Spear Mace"
};

// ── State ─────────────────────────────────────────────────────────────────
let allPlayers   = [];
let currentMode  = "overall";
let searchTerm   = "";
let regionFilter = "all";
let tierFilter   = "all";

// ── Puan hesapla ──────────────────────────────────────────────────────────
function calcScore(tiers) {
    return tiers.reduce((sum, t) => sum + (TIER_SCORES[t.tier] || 0), 0);
}

// ── Rank unvanı ───────────────────────────────────────────────────────────
function getRankTitle(score) {
    if (score >= 40) return "⚔️ PvP Ustası";
    if (score >= 28) return "🏆 Usta Savaşçı";
    if (score >= 18) return "🔥 İleri Savaşçı";
    if (score >= 10) return "🗡️ Savaşçı";
    if (score >= 5)  return "🛡️ Acemi Savaşçı";
    return "💫 Yeni Oyuncu";
}

// ── Tier rozeti ───────────────────────────────────────────────────────────
function makeTierBadge(tier, mode, showMode = true) {
    const badge = document.createElement("div");
    badge.className = `tier-badge tier-${tier}`;
    badge.innerHTML = `<span>${tier}</span>${showMode ? `<span class="tier-mode">${mode.substring(0,3).toUpperCase()}</span>` : ""}`;
    badge.title = `${tier} - ${mode}`;
    return badge;
}

// ── Bölge rozeti ──────────────────────────────────────────────────────────
function makeRegionBadge(region) {
    const el = document.createElement("span");
    const validRegions = ["TR", "EU", "NA"];
    const r = validRegions.includes(region) ? region : "TR";
    el.className = `region-badge region-${r}`;
    el.textContent = r;
    return el;
}

// ── Sıra numarası ─────────────────────────────────────────────────────────
function makeRankNum(rank) {
    if (rank === 1) return `<span class="rank-medal">🥇</span>`;
    if (rank === 2) return `<span class="rank-medal">🥈</span>`;
    if (rank === 3) return `<span class="rank-medal">🥉</span>`;
    return `<span>${rank}</span>`;
}

// ── Avatar URL ────────────────────────────────────────────────────────────
function getAvatarUrl(player) {
    // Sadece Minecraft skin'i göster (Kullanıcı isteği üzerine Discord pfp kapatıldı)
    return `https://mc-heads.net/avatar/${encodeURIComponent(player.nick)}/48`;
}

// ── Satır oluştur ─────────────────────────────────────────────────────────
function createPlayerRow(player, rank, activeMode) {
    const modeLabel = MODE_LABELS[activeMode];
    const modeTiers = activeMode === "overall"
        ? player.tiers
        : player.tiers.filter(t => t.mode === modeLabel);
    const modeScore = calcScore(modeTiers);

    const row = document.createElement("div");
    row.className = `player-row rank-${Math.min(rank, 4)}`;
    row.style.animationDelay = `${(rank - 1) * 25}ms`;

    // Rank
    const rankDiv = document.createElement("div");
    rankDiv.className = "col-rank-num";
    rankDiv.innerHTML = makeRankNum(rank);

    // Player info
    const playerDiv = document.createElement("div");
    playerDiv.className = "col-player-info";
    const img = document.createElement("img");
    img.className = "player-avatar";
    img.src = getAvatarUrl(player);
    img.alt = player.nick;
    img.onerror = () => { img.src = "https://mc-heads.net/avatar/Steve/48"; };
    const nameBlock = document.createElement("div");
    nameBlock.className = "player-name-block";
    nameBlock.innerHTML = `
        <div class="player-name">${escapeHtml(player.nick)}</div>
        <div class="player-rank-label">${getRankTitle(player.score)} · ${player.score} puan</div>
    `;
    playerDiv.appendChild(img);
    playerDiv.appendChild(nameBlock);

    // Region
    const regionDiv = document.createElement("div");
    regionDiv.className = "col-region-badge";
    regionDiv.appendChild(makeRegionBadge(player.region));

    // Tiers
    const tiersDiv = document.createElement("div");
    tiersDiv.className = "col-tiers-list";
    modeTiers.forEach(t => tiersDiv.appendChild(makeTierBadge(t.tier, t.mode, activeMode === "overall")));
    if (modeTiers.length === 0) {
        tiersDiv.innerHTML = `<span style="color:var(--text-muted);font-size:12px">—</span>`;
    }

    // Points
    const pointsDiv = document.createElement("div");
    pointsDiv.className = "col-points-val";
    pointsDiv.innerHTML = `${modeScore}<span class="points-sub">${player.tiers.length} tier</span>`;

    row.appendChild(rankDiv);
    row.appendChild(playerDiv);
    row.appendChild(regionDiv);
    row.appendChild(tiersDiv);
    row.appendChild(pointsDiv);

    return row;
}

// ── XSS önleme ───────────────────────────────────────────────────────────
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ── Tabloyu render et ─────────────────────────────────────────────────────
function renderTable() {
    const table = document.getElementById("rankings-table");
    const empty = document.getElementById("empty-state");
    table.innerHTML = "";

    const modeLabel = MODE_LABELS[currentMode];

    let players = allPlayers.filter(p => {
        // Mod filtresi
        if (currentMode !== "overall") {
            if (!p.tiers.some(t => t.mode === modeLabel)) return false;
        }
        // Region
        if (regionFilter !== "all" && p.region !== regionFilter) return false;
        // Tier
        if (tierFilter !== "all") {
            const check = currentMode === "overall"
                ? p.tiers.some(t => t.tier === tierFilter)
                : p.tiers.some(t => t.tier === tierFilter && t.mode === modeLabel);
            if (!check) return false;
        }
        // Arama
        if (searchTerm && !p.nick.toLowerCase().includes(searchTerm)) return false;
        return true;
    });

    // Sırala
    players = [...players].sort((a, b) => {
        const sa = currentMode === "overall"
            ? a.score
            : calcScore(a.tiers.filter(t => t.mode === modeLabel));
        const sb = currentMode === "overall"
            ? b.score
            : calcScore(b.tiers.filter(t => t.mode === modeLabel));
        return sb - sa;
    });

    if (players.length === 0) {
        empty.style.display = "block";
        return;
    }
    empty.style.display = "none";

    players.forEach((p, i) => table.appendChild(createPlayerRow(p, i + 1, currentMode)));
}

// ── API'dan veri çek ──────────────────────────────────────────────────────
async function fetchPlayers() {
    const table = document.getElementById("rankings-table");
    const statusEl = document.getElementById("api-status");

    table.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner"></div>
            <span>Discord'dan veri yükleniyor...</span>
        </div>`;

    try {
        const res  = await fetch(API_URL, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        allPlayers = data.players || [];

        // Hero istatistikleri
        document.getElementById("total-players").textContent = allPlayers.length;
        document.getElementById("total-tiers").textContent =
            allPlayers.reduce((s, p) => s + p.tiers.length, 0);

        if (statusEl) {
            const d = new Date(data.updatedAt);
            statusEl.textContent = `Son güncelleme: ${d.toLocaleTimeString("tr-TR")}`;
            statusEl.style.color = "var(--text-muted)";
        }

        renderTable();
    } catch (err) {
        console.warn("API'ya ulaşılamadı:", err.message);
        
        // Eğer daha önce veri çektiysek tabloyu silme, sadece durumu güncelle
        if (allPlayers.length > 0) {
            if (statusEl) {
                statusEl.textContent = "Bağlantı koptu, tekrar deneniyor...";
                statusEl.style.color = "var(--accent-red)";
            }
        } else {
            // Hiç veri yoksa uyarı ekranını göster
            table.innerHTML = `
                <div class="loading-spinner" style="gap:12px">
                    <div style="font-size:40px">⚠️</div>
                    <strong style="color:var(--text-primary)">Botla bağlantı kurulamadı!</strong>
                    <p style="font-size:13px;text-align:center;max-width:340px">
                        Bot şu an çevrimdışı olabilir veya Discord'a bağlanmaya çalışıyor.<br>
                    </p>
                    <button onclick="fetchPlayers()" class="retry-btn">🔄 Tekrar Dene</button>
                </div>`;
        }
    }
}

// ── Otomatik yenile (her 30sn) ────────────────────────────────────────────
let autoRefreshTimer = null;
function startAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(fetchPlayers, 30000);
}

// ── Event Listeners ───────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentMode = btn.dataset.mode;
        renderTable();
    });
});

document.getElementById("search-input").addEventListener("input", e => {
    searchTerm = e.target.value.toLowerCase().trim();
    renderTable();
});

document.getElementById("region-filter").addEventListener("change", e => {
    regionFilter = e.target.value;
    renderTable();
});

document.getElementById("tier-filter").addEventListener("change", e => {
    tierFilter = e.target.value;
    renderTable();
});

// ── Başlat ────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
    fetchPlayers();
    startAutoRefresh();
});

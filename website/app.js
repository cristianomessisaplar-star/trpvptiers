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

function getModeIcon(mode) {
    const iconMap = {
        // küçük harf (key)
        sword:        "icons/sword.png",
        axe:          "icons/axe.png",
        mace:         "icons/mace.png",
        uhc:          "icons/uhc.png",
        pot:          "icons/pot.png",
        nethpot:      "icons/nethop.png",
        nethop:       "icons/nethop.png",
        smp:          "icons/smp.png",
        vanilla:      "icons/vanilla.png",
        spearmace:    "icons/spearmace.webp",
        // API'dan gelen büyük harfli isimler
        "Sword":      "icons/sword.png",
        "Axe":        "icons/axe.png",
        "Mace":       "icons/mace.png",
        "UHC":        "icons/uhc.png",
        "Pot":        "icons/pot.png",
        "NethOP":     "icons/nethop.png",
        "Neth Pot":   "icons/nethop.png",
        "SMP":        "icons/smp.png",
        "Vanilla":    "icons/vanilla.png",
        "Spear Mace": "icons/spearmace.webp",
    };
    const src = iconMap[mode] || iconMap[mode?.toLowerCase()?.replace(/\s/g, "")] || null;
    if (!src) return `<span style="font-size:16px">🎮</span>`;
    return `<img src="${src}" alt="${mode}" style="width:20px; height:20px; object-fit:contain;" onerror="this.outerHTML='🎮'">`;
}

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
    const wrapper = document.createElement("div");
    wrapper.className = `tier-icon-wrapper tier-color-${tier}`;
    wrapper.title = `${tier} - ${mode}`;

    const circle = document.createElement("div");
    circle.className = "tier-icon-circle";
    circle.innerHTML = getModeIcon(mode);

    const pill = document.createElement("div");
    pill.className = "tier-pill";
    pill.textContent = tier;

    wrapper.appendChild(circle);
    wrapper.appendChild(pill);
    return wrapper;
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
    row.onclick = () => openPlayerModal(player, rank, modeScore);

    // Rank
    const rankWrapper = document.createElement("div");
    rankWrapper.className = "player-rank-wrapper";
    rankWrapper.innerHTML = `
        <div class="player-rank-bg"></div>
        <div class="col-rank-num">${rank}.</div>
    `;

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
        <div class="player-rank-label">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            <span>${getRankTitle(player.score)} <span class="points-highlight">(${player.score} points)</span></span>
        </div>
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
    pointsDiv.innerHTML = `<span class="points-num">${modeScore}</span><span class="points-label">pts</span>`;

    row.appendChild(rankWrapper);
    row.appendChild(playerDiv);
    row.appendChild(regionDiv);
    row.appendChild(tiersDiv);
    row.appendChild(pointsDiv);

    return row;
}

// ── Pano İçin Satır (Tier Board Row) ──────────────────────────────────────────
function createBoardPlayerRow(player, tierString, modeScore, rank) {
    const row = document.createElement("div");
    row.className = "board-player-row";
    row.onclick = () => openPlayerModal(player, rank, modeScore);

    // Renk belirleme
    let borderColor = "#444";
    if (tierString === "HT1") borderColor = "#f3c13a";
    else if (tierString === "LT1") borderColor = "#a4aab9";
    else if (tierString === "HT2") borderColor = "#ff9b2e";
    else if (tierString === "LT2") borderColor = "#64748b";
    else if (tierString === "HT3") borderColor = "#cd7f32";
    else if (tierString === "LT3") borderColor = "#475569";
    else if (tierString === "HT4") borderColor = "#00e676";
    else if (tierString === "LT4") borderColor = "#334155";
    else if (tierString === "HT5") borderColor = "#42a5f5";
    else if (tierString === "LT5") borderColor = "#1e293b";

    row.style.setProperty("--border-color", borderColor);

    const img = document.createElement("img");
    img.className = "board-player-avatar";
    img.src = getAvatarUrl(player);
    img.onerror = () => { img.src = "https://mc-heads.net/avatar/Steve/48"; };

    const nameDiv = document.createElement("div");
    nameDiv.className = "board-player-name";
    nameDiv.textContent = player.nick;

    const chevDiv = document.createElement("div");
    chevDiv.className = "board-player-chevron";
    chevDiv.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>`;

    row.appendChild(img);
    row.appendChild(nameDiv);
    row.appendChild(chevDiv);

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
    const board = document.getElementById("tier-board");
    const empty = document.getElementById("empty-state");
    const header = document.querySelector(".table-header");
    
    table.innerHTML = "";
    board.innerHTML = "";

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

    if (players.length === 0) {
        empty.style.display = "block";
        table.style.display = "none";
        board.style.display = "none";
        if (header) header.style.display = "none";
        return;
    }
    empty.style.display = "none";

    // ── OVERALL MODE (List View) ──
    if (currentMode === "overall") {
        if (header) header.style.display = "flex";
        table.style.display = "flex";
        board.style.display = "none";

        // Sırala
        players = [...players].sort((a, b) => b.score - a.score);
        players.forEach((p, i) => table.appendChild(createPlayerRow(p, i + 1, currentMode)));
    } 
    // ── SPECIFIC MODE (Tier Board View) ──
    else {
        if (header) header.style.display = "none";
        table.style.display = "none";
        board.style.display = "grid";

        // 5 Kolon oluştur
        const columns = {
            1: { element: document.createElement("div"), players: [] },
            2: { element: document.createElement("div"), players: [] },
            3: { element: document.createElement("div"), players: [] },
            4: { element: document.createElement("div"), players: [] },
            5: { element: document.createElement("div"), players: [] }
        };

        // Kolon elementlerini hazırla
        for (let i = 1; i <= 5; i++) {
            columns[i].element.className = "tier-board-col";
            columns[i].element.innerHTML = `
                <div class="tier-col-header tier-${i}">
                    ${i === 1 ? '🏆' : i === 2 ? '🥈' : i === 3 ? '🥉' : ''} Tier ${i}
                </div>
                <div class="tier-col-body" id="tier-col-body-${i}"></div>
            `;
            board.appendChild(columns[i].element);
        }

        // Oyuncuları grupla
        players.forEach(p => {
            const mTier = p.tiers.find(t => t.mode === modeLabel);
            if (!mTier) return;
            const tStr = mTier.tier; // HT1, LT2 vs.
            let colIndex = 5;
            if (tStr.includes("1")) colIndex = 1;
            else if (tStr.includes("2")) colIndex = 2;
            else if (tStr.includes("3")) colIndex = 3;
            else if (tStr.includes("4")) colIndex = 4;

            p._currentModeTierString = tStr; // geçici kaydet
            columns[colIndex].players.push(p);
        });

        // Her kolon içindeki oyuncuları sırala (Önce HT, sonra LT, sonra total score)
        for (let i = 1; i <= 5; i++) {
            const colPlayers = columns[i].players.sort((a, b) => {
                const ta = a._currentModeTierString;
                const tb = b._currentModeTierString;
                // HT'ler LT'lerden üstündür
                if (ta.startsWith("H") && tb.startsWith("L")) return -1;
                if (ta.startsWith("L") && tb.startsWith("H")) return 1;
                // Aynı alt tier ise genel skora göre (ya da isme göre)
                return b.score - a.score;
            });

            const bodyEl = columns[i].element.querySelector(".tier-col-body");
            colPlayers.forEach((p, index) => {
                const modeScore = calcScore(p.tiers.filter(t => t.mode === modeLabel));
                // Pano görünümünde "rank" her zaman 0 olsun veya modalda rank göstermeye gerek yok
                bodyEl.appendChild(createBoardPlayerRow(p, p._currentModeTierString, modeScore, index + 1));
            });
        }
    }
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

// ── Modal İşlemleri ────────────────────────────────────────────────────────
function openPlayerModal(player, rank, score) {
    document.getElementById("modal-avatar").src = getAvatarUrl(player);
    document.getElementById("modal-username").textContent = player.nick;
    document.getElementById("modal-rank-title").textContent = getRankTitle(player.score);
    
    const regionNames = { "TR": "Turkey", "EU": "Europe", "NA": "North America" };
    document.getElementById("modal-region").textContent = regionNames[player.region] || player.region;
    
    document.getElementById("modal-namemc").href = `https://namemc.com/profile/${encodeURIComponent(player.nick)}`;
    
    document.getElementById("modal-rank-num").textContent = `${rank}.`;
    document.getElementById("modal-points").textContent = `(${score} points)`;
    
    const tiersList = document.getElementById("modal-tiers-list");
    tiersList.innerHTML = "";
    
    const modeTiers = currentMode === "overall" ? player.tiers : player.tiers.filter(t => t.mode === MODE_LABELS[currentMode]);
    modeTiers.forEach(t => {
        tiersList.appendChild(makeTierBadge(t.tier, t.mode, true));
    });
    
    if (modeTiers.length === 0) {
        tiersList.innerHTML = `<span style="color:#64748b;font-size:13px">No tiers recorded.</span>`;
    }
    
    document.getElementById("player-modal").classList.add("active");
}

document.addEventListener("DOMContentLoaded", () => {
    const closeBtn = document.getElementById("modal-close-btn");
    const modal = document.getElementById("player-modal");
    
    if(closeBtn) {
        closeBtn.addEventListener("click", () => {
            modal.classList.remove("active");
        });
    }
    
    if(modal) {
        modal.addEventListener("click", (e) => {
            if (e.target.id === "player-modal") {
                modal.classList.remove("active");
            }
        });
    }
});

/**
 * TR PvP TierList - Main App JS
 * Discord botundan gelen verilerle çalışır.
 * Şu an demo veriler yüklü; botu bağladıktan sonra
 * fetchPlayers() fonksiyonu gerçek veriye bağlanacak.
 */

// ── Tier puanları (bot ile aynı) ──────────────────────────────────────────
const TIER_SCORES = {
    HT1: 60, LT1: 45,
    HT2: 30,  LT2: 20,
    HT3: 10,  LT3: 6,
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

// ── Demo oyuncu verisi ────────────────────────────────────────────────────
// Her oyuncu: { nick, region, tiers: [{ tier:"HT1", mode:"Sword" }, ...] }
let allPlayers = [];

// ── Yardımcı: Puan hesapla ────────────────────────────────────────────────
function calcScore(tiers) {
    return tiers.reduce((sum, t) => sum + (TIER_SCORES[t.tier] || 0), 0);
}

// ── Skin URL (Crafatar) ───────────────────────────────────────────────────
function getSkinUrl(nick) {
    return `https://mc-heads.net/avatar/${encodeURIComponent(nick)}/48`;
}

const modeIconsMap = {
    "sword": "icons/sword.png",
    "axe": "icons/axe.png",
    "mace": "icons/mace.png",
    "uhc": "icons/uhc.png",
    "pot": "icons/pot.png",
    "nethpot": "icons/nethop.png",
    "smp": "icons/smp.png",
    "vanilla": "icons/vanilla.png",
    "spearmace": "icons/spearmace.webp"
};

// ── Rozet etiketi oluştur ─────────────────────────────────────────────────
function makeTierBadge(tier, mode, showMode = true) {
    const tierDiv = document.createElement("div");
    tierDiv.style.display = "flex";
    tierDiv.style.flexDirection = "column";
    tierDiv.style.alignItems = "center";
    tierDiv.style.gap = "6px";
    tierDiv.title = `${tier} - ${mode}`;
    
    let colorCode = "#3498db";
    if(tier.includes('1')) colorCode = "#f1c40f";
    else if(tier.includes('2')) colorCode = "#bdc3c7";
    else if(tier.includes('3')) colorCode = "#cd7f32";
    else if(tier.includes('4')) colorCode = "#9b59b6";
    
    if (showMode) {
        const imgBox = document.createElement("div");
        imgBox.style.width = "36px";
        imgBox.style.height = "36px";
        imgBox.style.borderRadius = "50%";
        imgBox.style.border = `1.5px solid ${colorCode}`;
        imgBox.style.background = "#0d1117"; 
        imgBox.style.display = "flex";
        imgBox.style.alignItems = "center";
        imgBox.style.justifyContent = "center";
        
        let iconUrl = modeIconsMap[mode.toLowerCase()] || modeIconsMap["sword"]; 
        imgBox.innerHTML = `<img src="${iconUrl}" width="20" height="20" alt="${mode}">`;
        tierDiv.appendChild(imgBox);
    }
    
    const label = document.createElement("span");
    label.textContent = tier;
    label.style.fontSize = "12px";
    label.style.fontWeight = "800";
    label.style.color = colorCode;
    
    tierDiv.appendChild(label);
    
    return tierDiv;
}

// ── Bölge rozeti ──────────────────────────────────────────────────────────
function makeRegionBadge(region) {
    const badge = document.createElement("span");
    badge.className = `region-badge region-${region}`;
    badge.textContent = region;
    return badge;
}

// ── Sıra numarası ─────────────────────────────────────────────────────────
function makeRankNum(rank) {
    if (rank === 1) return `<span class="rank-medal">🥇</span>`;
    if (rank === 2) return `<span class="rank-medal">🥈</span>`;
    if (rank === 3) return `<span class="rank-medal">🥉</span>`;
    return `<span>${rank}</span>`;
}

// ── Rank unvanı hesapla ───────────────────────────────────────────────────
function getRankTitle(score) {
    if (score >= 400) return "Combat Grandmaster";
    if (score >= 250) return "Combat Master";
    if (score >= 100) return "Combat Ace";
    if (score >= 50) return "Combat Specialist";
    if (score >= 20) return "Combat Cadet";
    if (score >= 10) return "Combat Novice";
    return "Rookie";
}

// ── Satır oluştur ─────────────────────────────────────────────────────────
function createPlayerRow(player, rank, activeMode) {
    const score = calcScore(player.tiers);

    const row = document.createElement("div");
    row.className = `player-row rank-${Math.min(rank, 4)}`;
    row.style.animationDelay = `${(rank - 1) * 30}ms`;

    // Rank
    const rankDiv = document.createElement("div");
    rankDiv.className = "col-rank-num";
    rankDiv.innerHTML = makeRankNum(rank);

    // Player info
    const playerDiv = document.createElement("div");
    playerDiv.className = "col-player-info";
    const img = document.createElement("img");
    img.className = "player-avatar";
    img.src = getSkinUrl(player.nick);
    img.alt = player.nick;
    img.onerror = () => { img.src = "https://mc-heads.net/avatar/Steve/48"; };
    const nameBlock = document.createElement("div");
    nameBlock.className = "player-name-block";
    nameBlock.innerHTML = `<div class="player-name">${player.nick}</div><div class="player-rank-label">${getRankTitle(score)} · ${score} puan</div>`;
    playerDiv.appendChild(img);
    playerDiv.appendChild(nameBlock);

    // Region
    const regionDiv = document.createElement("div");
    regionDiv.className = "col-region-badge";
    regionDiv.appendChild(makeRegionBadge(player.region));

    // Tiers
    const tiersDiv = document.createElement("div");
    tiersDiv.className = "col-tiers-list";

    let displayTiers = player.tiers;
    // Eğer belirli bir mod seçiliyse sadece o modu göster
    if (activeMode !== "overall") {
        const modeLabel = MODE_LABELS[activeMode];
        displayTiers = player.tiers.filter(t => t.mode === modeLabel);
    }
    displayTiers.forEach(t => {
        tiersDiv.appendChild(makeTierBadge(t.tier, t.mode, activeMode === "overall"));
    });

    // Points
    const pointsDiv = document.createElement("div");
    pointsDiv.className = "col-points-val";
    pointsDiv.innerHTML = `${score}<span class="points-sub">${player.tiers.length} tier</span>`;

    row.appendChild(rankDiv);
    row.appendChild(playerDiv);
    row.appendChild(regionDiv);
    row.appendChild(tiersDiv);
            row.appendChild(pointsDiv);

    return row;
}

// ── Tabloyu render et ─────────────────────────────────────────────────────
let currentMode = "overall";
let searchTerm  = "";
let regionFilter = "all";
let tierFilter   = "all";

function renderTable() {
    const table  = document.getElementById("rankings-table");
    const empty  = document.getElementById("empty-state");
    table.innerHTML = "";

    const modeLabel = MODE_LABELS[currentMode];

    // Filtrele
    let players = allPlayers.filter(p => {
        // Mod filtresi
        if (currentMode !== "overall") {
            const hasMod = p.tiers.some(t => t.mode === modeLabel);
            if (!hasMod) return false;
        }
        // Region filtresi
        if (regionFilter !== "all" && p.region !== regionFilter) return false;
        // Tier filtresi
        if (tierFilter !== "all") {
            const hasTier = p.tiers.some(t => t.tier === tierFilter &&
                (currentMode === "overall" || t.mode === modeLabel));
            if (!hasTier) return false;
        }
        // Arama
        if (searchTerm && !p.nick.toLowerCase().includes(searchTerm)) return false;
        return true;
    });

    // Modda sırala: sadece o modun tierleri; overall'da toplam puan
    players.sort((a, b) => {
        const scoreA = currentMode === "overall"
            ? calcScore(a.tiers)
            : calcScore(a.tiers.filter(t => t.mode === modeLabel));
        const scoreB = currentMode === "overall"
            ? calcScore(b.tiers)
            : calcScore(b.tiers.filter(t => t.mode === modeLabel));
        return scoreB - scoreA;
    });

    if (players.length === 0) {
        empty.style.display = "block";
        return;
    }
    empty.style.display = "none";

    players.forEach((p, i) => {
        table.appendChild(createPlayerRow(p, i + 1, currentMode));
    });

    // Hero istatistikleri güncelle
    document.getElementById("total-players").textContent = allPlayers.length;
    document.getElementById("total-tiers").textContent = allPlayers.reduce((s, p) => s + p.tiers.length, 0);
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
window.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch('/api/players');
        if (response.ok) {
            const data = await response.json();
            allPlayers = data.players || [];
        } else {
            console.error("Failed to fetch players:", response.statusText);
        }
    } catch (err) {
        console.error("Error fetching API:", err);
    }
    // Kısa bir gecikme ile "yükleniyor" efekti
    setTimeout(renderTable, 600);
});

// ── Modal Mantığı ─────────────────────────────────────────────────────────
const modalOverlay = document.getElementById("playerModal");
const modalClose = document.getElementById("modalClose");

const mAvatar = document.getElementById("modalAvatar");
const mName = document.getElementById("modalName");
const mTitle = document.getElementById("modalTitle");
const mRegion = document.getElementById("modalRegionText");
const mNameMC = document.getElementById("modalNameMC");
const mRankNum = document.getElementById("modalRankNum");
const mPoints = document.getElementById("modalPoints");
const mTiersBox = document.getElementById("modalTiersBox");

const regionNames = {
    "NA": "North America",
    "EU": "Europe",
    "TR": "Turkey"
};

function openModal(playerName, rank) {
    const player = allPlayers.find(p => p.nick === playerName);
    if (!player) return;
    
    const score = calcScore(player.tiers);
    
    mAvatar.src = getSkinUrl(player.nick);
    mName.textContent = player.nick;
    mTitle.textContent = getRankTitle(score);
    
    const r = player.region ? player.region.toUpperCase() : "EU";
    mRegion.textContent = regionNames[r] || r;
    
    mNameMC.href = `https://namemc.com/profile/${player.nick}`;
    mRankNum.textContent = rank + ".";
    mPoints.textContent = `(${score} points)`;
    
    mTiersBox.innerHTML = "";
    
    player.tiers.forEach(t => {
        let iconUrl = modeIconsMap[t.mode.toLowerCase()] || modeIconsMap["sword"]; 
        let iconHtml = `<img src="${iconUrl}" width="20" height="20" alt="${t.mode}">`;
        
        let colorCode = "#3498db";
        if(t.tier.includes('1')) colorCode = "#f1c40f";
        else if(t.tier.includes('2')) colorCode = "#bdc3c7";
        else if(t.tier.includes('3')) colorCode = "#cd7f32";
        else if(t.tier.includes('4')) colorCode = "#9b59b6";
        
        const tierDiv = document.createElement("div");
        tierDiv.style.display = "flex";
        tierDiv.style.flexDirection = "column";
        tierDiv.style.alignItems = "center";
        tierDiv.style.gap = "6px";
        
        const imgBox = document.createElement("div");
        imgBox.style.width = "36px";
        imgBox.style.height = "36px";
        imgBox.style.borderRadius = "50%";
        imgBox.style.border = `1.5px solid ${colorCode}`;
        imgBox.style.background = "#0d1117"; // matches background
        imgBox.style.display = "flex";
        imgBox.style.alignItems = "center";
        imgBox.style.justifyContent = "center";
        imgBox.style.color = "#c9d1d9";
        imgBox.style.fontSize = "16px";
        imgBox.innerHTML = iconHtml;
        
        const label = document.createElement("span");
        label.textContent = t.tier;
        label.style.fontSize = "12px";
        label.style.fontWeight = "800";
        label.style.color = colorCode;
        
        badge.appendChild(iconDiv);
        badge.appendChild(tierText);
        mTiersBox.appendChild(badge);
    });
    
    // Modalı Göster
    modalOverlay.classList.add("active");
}

/* --- INFO MODAL LOGIC --- */
const infoModal = document.getElementById("infoModal");
const infoModalClose = document.getElementById("infoModalClose");
const openInfoBtn = document.getElementById("openInfoBtn");
const infoTabBtns = document.querySelectorAll(".info-tab-btn");
const infoTabContents = document.querySelectorAll(".info-tab-content");

openInfoBtn.addEventListener("click", (e) => {
    e.preventDefault();
    infoModal.classList.add("active");
});

infoModalClose.addEventListener("click", () => {
    infoModal.classList.remove("active");
});

infoModal.addEventListener("click", (e) => {
    if (e.target === infoModal) {
        infoModal.classList.remove("active");
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && infoModal.classList.contains("active")) {
        infoModal.classList.remove("active");
    }
});

infoTabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        infoTabBtns.forEach(b => b.classList.remove("active"));
        infoTabContents.forEach(c => c.classList.remove("active"));
        
        btn.classList.add("active");
        document.getElementById(`tab-content-${btn.dataset.tab}`).classList.add("active");
    });
});

function closeModal() {
    modalOverlay.classList.remove("active");
}

modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
});

// Satıra Tıklayınca Modal Açılsın
document.getElementById("rankings-table").addEventListener("click", (e) => {
    const row = e.target.closest(".player-row");
    if (!row) return;
    
    const playerName = row.querySelector(".player-name").textContent.trim();
    // Rank numarasını doğrudan satırdan alalım (span içinden)
    let rankText = row.querySelector(".col-rank-num").textContent.trim();
    if(rankText === "🥇") rankText = "1";
    if(rankText === "🥈") rankText = "2";
    if(rankText === "🥉") rankText = "3";
    
    openModal(playerName, rankText);
});


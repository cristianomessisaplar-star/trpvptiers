"use strict";

const { 
    Client, 
    Intents, 
    MessageEmbed, 
    MessageButton, 
    MessageActionRow,
    MessageSelectMenu 
} = require("discord.js");

// ── CONFIG YÜKLEME VEYA ENV KULLANMA ───────────────────────────────────────
let config;
try {
    config = require("./config.json");
} catch (e) {
    // config.json yoksa (örneğin Render/Glitch üzerinde çalışırken) ortam değişkenini kullan
    config = {
        token: process.env.TOKEN
    };
}

if (!config.token) {
    console.error("[HATA] Bot tokeni bulunamadı! config.json dosyasını kontrol et veya TOKEN environment variable ayarla.");
    process.exit(1);
}

const fs    = require("fs");
const ms    = require("ms");
const https = require("https");
const http  = require("http");

// Mojang API ile MC hesabı varlığını kontrol et; yoksa mugm_ döner
function resolveNick(nick) {
    return new Promise((resolve) => {
        const req = https.get(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(nick)}`, (res) => {
            resolve(res.statusCode === 200 ? nick : "mugm_");
        });
        req.on("error", () => resolve("mugm_"));
        req.setTimeout(3000, () => { req.destroy(); resolve("mugm_"); });
    });
}

// İşlenmiş mesaj ID'leri (çift uyarı önleme)
const processedWarnings = new Set();

// ── IN-MEMORY CACHE (disk I/O azaltmak için) ────────────────────────────────
let _etiketEngelliler   = null; // etiketEngelliler.json cache
let _cooldownConfig     = null; // cooldownConfig.json cache
let _testerLogConfig    = null; // testerLogConfig.json cache
let _testerStats        = null; // testerStats.json cache
let _testerWarnings     = null; // testerWarnings.json cache
let _weeklyTester       = null; // weeklyTester.json cache

function getEtiketEngelliler() {
    if (_etiketEngelliler === null) {
        try { _etiketEngelliler = JSON.parse(fs.readFileSync("etiketEngelliler.json", "utf-8")); }
        catch(e) { _etiketEngelliler = []; }
    }
    return _etiketEngelliler;
}
function saveEtiketEngelliler(data) {
    _etiketEngelliler = data;
    fs.writeFileSync("etiketEngelliler.json", JSON.stringify(data, null, 2));
}

function getCooldownConfig() {
    if (_cooldownConfig === null) {
        try { _cooldownConfig = JSON.parse(fs.readFileSync("cooldownConfig.json", "utf-8")); }
        catch(e) { _cooldownConfig = { systemActive: true, roles: {}, users: {} }; }
    }
    return _cooldownConfig;
}
function saveCooldownConfig(data) {
    _cooldownConfig = data;
    fs.writeFileSync("cooldownConfig.json", JSON.stringify(data, null, 2));
}

function getTesterLogConfig() {
    if (_testerLogConfig === null) {
        try { _testerLogConfig = JSON.parse(fs.readFileSync("testerLogConfig.json", "utf-8")); }
        catch(e) { _testerLogConfig = { channelId: "1516849153366298925" }; }
    }
    return _testerLogConfig;
}

function getTesterStats() {
    if (_testerStats === null) {
        try { _testerStats = JSON.parse(fs.readFileSync("testerStats.json", "utf-8")); }
        catch(e) { _testerStats = {}; }
    }
    return _testerStats;
}
function saveTesterStatsData(data) {
    _testerStats = data;
    fs.writeFileSync("testerStats.json", JSON.stringify(data, null, 2));
}

function getTesterWarnings() {
    if (_testerWarnings === null) {
        try { _testerWarnings = JSON.parse(fs.readFileSync("testerWarnings.json", "utf-8")); }
        catch(e) { _testerWarnings = {}; }
    }
    return _testerWarnings;
}
function saveTesterWarningsData(data) {
    _testerWarnings = data;
    fs.writeFileSync("testerWarnings.json", JSON.stringify(data, null, 2));
}

function getWeeklyTester() {
    if (_weeklyTester === null) {
        try { _weeklyTester = JSON.parse(fs.readFileSync("weeklyTester.json", "utf-8")); }
        catch(e) { _weeklyTester = { autoEnabled: false, currentTester: null }; }
    }
    return _weeklyTester;
}
function saveWeeklyTester(data) {
    _weeklyTester = data;
    fs.writeFileSync("weeklyTester.json", JSON.stringify(data, null, 2));
}

// --- MEVCUT DOSYA KONTROLLERİ ---
if (!fs.existsSync("panelData.json")) {
    fs.writeFileSync("panelData.json", JSON.stringify({}));
}
// config.json check removed for Render
if (!fs.existsSync("testerStats.json")) {
    fs.writeFileSync("testerStats.json", JSON.stringify({}));
}
if (!fs.existsSync("cooldownConfig.json")) {
    fs.writeFileSync("cooldownConfig.json", JSON.stringify({ systemActive: true, roles: {}, users: {} }));
}
if (!fs.existsSync("etiketEngelliler.json")) {
    fs.writeFileSync("etiketEngelliler.json", JSON.stringify([]));
}
if (!fs.existsSync("ticketData.json")) {
    fs.writeFileSync("ticketData.json", JSON.stringify({}));
}
if (!fs.existsSync("leaderboardData.json")) {
    fs.writeFileSync("leaderboardData.json", JSON.stringify({}));
}

// config duplicate removed
const bot = new Client({ 
    intents: [
        Intents.FLAGS.GUILDS, 
        Intents.FLAGS.GUILD_MESSAGES, 
        Intents.FLAGS.GUILD_MEMBERS, 
        Intents.FLAGS.GUILD_VOICE_STATES,
        Intents.FLAGS.GUILD_PRESENCES
    ] 
});

const gameModes = {
    sword:     { name: "Sword",      channelId: "1515011061579907234", testerRole: "1515451458764673064", roleId: "1515311000360980551", emoji: "🗡️" },
    axe:       { name: "Axe",        channelId: "1515451892652703914", testerRole: "1515451575399612478", roleId: "1515403534760149022", emoji: "🪓" },
    mace:      { name: "Mace",       channelId: "1515041890205040810", testerRole: "1515451528255639696", roleId: "1515310939392577586", emoji: "🔨" },
    uhc:       { name: "UHC",        channelId: "1515442404071833763", testerRole: "1515451656488222741", roleId: "1515060511186882821", emoji: "🪣" },
    pot:       { name: "Pot",        channelId: "1515706564432891944", testerRole: "1515628645073551530", roleId: "1515707611092226239", emoji: "💀" },
    nethpot:   { name: "Nethpot",    channelId: "1515703393321222336", testerRole: "1515703463034622023", roleId: "1515707010333806663", emoji: "☠️" },
    smp:       { name: "SMP",        channelId: "1515041907472990388", testerRole: "1515451785416933537", roleId: "1515311169496416386", emoji: "🌍" },
    vanilla:   { name: "Vanilla",    channelId: "1515011085088985372", testerRole: "1515451725782323290", roleId: "1515310793724264498", emoji: "🔮" },
    spearmace: { name: "Spear Mace", channelId: "1515048601397497866", testerRole: "1515449240330047560", roleId: "1515311057084878939", emoji: "🔱" }
};

// Tier puanlama sistemi (HT1 = en yüksek = 10, LT5 = en düşük = 1)
const TIER_SCORES = {
    "HT1": 10, "LT1": 9,
    "HT2": 8,  "LT2": 7,
    "HT3": 6,  "LT3": 5,
    "HT4": 4,  "LT4": 3,
    "HT5": 2,  "LT5": 1
};

const testerRoleID      = "1515002723131457619";
const hileRoleId        = "1516490667071770744"; 
const hileLogChannelId  = "1515029082817957980";
const sonucChannelId    = "1514987714502725653";
const ticketCategoryID  = "1516507584461279472";
const testCategoryID    = "1516509251499987054";
const rulesChannelId    = "1516738745548800010";
const rolVerRoleId      = "1515705281890488450";      // /rol-ver komutu yetkisi
const yoneticiRol1      = "1516515161089773736";      // /leaderboard ve /tier-göç yetkisi
const yoneticiRol2      = "1514980839560188156";      // /leaderboard ve /tier-göç yetkisi

// Global hata yakalayıcı - botu çökmekten korur
process.on("unhandledRejection", (error) => {
    console.error("[HATA] Yakalanmamış Promise Hatası:", error);
});

var modeQueues = {};
var modeMessages = {};
var activeTestersByMode = {};
var activeTests = {};
var lastTestSessions = {};
for (const key of Object.keys(gameModes)) {
    modeQueues[key] = [];
    modeMessages[key] = null;
    activeTestersByMode[key] = new Set();
    activeTests[key] = new Set();
    lastTestSessions[key] = null;
}

var testCooldowns = new Map();

// ── Değişiklik takip sistemi (gereksiz panel güncellemelerini önler) ──────────
const _panelDirty = {};
for (const key of Object.keys(gameModes)) _panelDirty[key] = false;

function markPanelDirty(mod) { _panelDirty[mod] = true; }

// ── Yardımcı fonksiyonlar ──────────────────────────────────────────────────

// testerLog kanalını belleğe al (her seferinde diskten okuma)
let _testerLogChannel = null;
async function sendTesterLog(botObj, title, desc, color = "#3498db") {
    try {
        const conf = getTesterLogConfig();
        const channelId = conf.channelId || "1516849153366298925";
        // Kanal cache'te varsa tekrar fetch etme
        if (!_testerLogChannel || _testerLogChannel.id !== channelId) {
            _testerLogChannel = await botObj.channels.fetch(channelId).catch(() => null);
        }
        if (_testerLogChannel) {
            const embed = new MessageEmbed()
                .setTitle(title)
                .setDescription(desc)
                .setColor(color)
                .setTimestamp();
            await _testerLogChannel.send({ embeds: [embed] });
        }
    } catch(e) {}
}

function saveTesterStat(testerId) {
    const stats = getTesterStats();
    stats[testerId] = (stats[testerId] || 0) + 1;
    saveTesterStatsData(stats);
}

// panelData için in-memory cache
let _panelData = null;
function getPanelData() {
    if (_panelData === null) {
        try { _panelData = JSON.parse(fs.readFileSync("panelData.json", "utf-8")); }
        catch(e) { _panelData = {}; }
    }
    return _panelData;
}
function savePanelData(mod, messageId, channelId) {
    const data = getPanelData();
    data[mod] = { messageId, channelId };
    _panelData = data;
    fs.writeFileSync("panelData.json", JSON.stringify(data, null, 2));
}

// ticketData için in-memory cache
let _ticketData = null;
function getTicketData() {
    if (_ticketData === null) {
        try { _ticketData = JSON.parse(fs.readFileSync("ticketData.json", "utf-8")); }
        catch(e) { _ticketData = {}; }
    }
    return _ticketData;
}
function saveTicketData(data) {
    _ticketData = data;
    fs.writeFileSync("ticketData.json", JSON.stringify(data));
}

async function updateQueuePanel(mod, guild) {
    if (!guild) return;
    const msg = modeMessages[mod];
    if (!msg) return;

    try {
        const modInfo = gameModes[mod];
        const queue   = modeQueues[mod];
        const testers = activeTestersByMode[mod];
        const status  = testers.size > 0;

        let qEmbed = new MessageEmbed();
        let components = [];

        if (!status) {
            // KAPALI DURUM (MCTIERS Tarzı)
            let dateStr = "Bilinmiyor";
            if (lastTestSessions[mod]) {
                const d = new Date(lastTestSessions[mod]);
                dateStr = d.toLocaleString("tr-TR", { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            }

            qEmbed
                .setColor("#ED4245")
                .setAuthor({ name: "TRPVPTİERS" })
                .setTitle("Şu Anda Aktif Tester Yok")
                .setDescription(`Şu anda **${modInfo.name}** bölgeniz için uygun bir tester bulunmamaktadır.\nBir tester aktif olduğunda sıra sistemi açılacaktır.\nDaha sonra tekrar kontrol edin!\n\nSon test oturumu: \`${dateStr}\``);

            // Kapalıyken buton yok
        } else {
            // AÇIK DURUM (MCTIERS Tarzı)
            const desc = 
                "⏱️ Sıra her 10 saniyede bir güncellenir.\n" +
                "Sıradan ayrılmak isterseniz butonu veya `/leave` komutunu kullanın.\n\n" +
                `**Sıra (${queue.length}/20):**\n` +
                (queue.map((u, i) => `**${i + 1}.** <@${u}>`).join("\n") || "_Sıra boş._") +
                "\n\n**Aktif Testerlar:**\n" +
                Array.from(testers).map((id, i) => `**${i + 1}.** <@${id}>`).join("\n");

            qEmbed
                .setColor("#5865F2")
                .setTitle("Tester(lar) Aktif!")
                .setDescription(desc);

            components.push(
                new MessageActionRow().addComponents(
                    new MessageButton()
                        .setCustomId(`join_${mod}`)
                        .setLabel("Sıraya Katıl")
                        .setStyle("PRIMARY")
                        .setDisabled(queue.length >= 20),
                    new MessageButton()
                        .setCustomId("check_cooldown")
                        .setLabel("Cooldown Kontrol")
                        .setStyle("SECONDARY")
                        .setEmoji("⏰")
                )
            );
        }
        _panelDirty[mod] = false; // güncellendi, temiz
        await msg.edit({ content: null, embeds: [qEmbed], components });
    } catch (e) {
        console.error(`Sıra paneli güncellenirken hata (${mod}):`, e);
    }
}

// Skin URL'si geçerli mi kontrol et (korsan fallback için)
function getSkinUrl(nick, type) {
    // type: "bust" veya "full"
    return `https://visage.surgeplay.com/${type}/512/${nick}.png`;
}

// Tier skorunu hesapla - bir üyenin tüm tier rollerinin toplamı
function calcMemberTierScore(member) {
    let score = 0;
    let tierCount = 0;
    for (const [, role] of member.roles.cache) {
        const parts = role.name.split("-");
        if (parts.length < 2) continue;
        const tierPart = parts[0]; // "LT5", "HT1" vb.
        if (TIER_SCORES[tierPart] !== undefined) {
            score += TIER_SCORES[tierPart];
            tierCount++;
        }
    }
    return { score, tierCount };
}

// Tier-göç için tüm seçenekleri üret
function getTierGocChoices() {
    const tiers = ["HT1", "LT1", "HT2", "LT2", "HT3", "LT3", "HT4", "LT4", "HT5", "LT5"];
    const choices = [];
    for (const [, modInfo] of Object.entries(gameModes)) {
        for (const tier of tiers) {
            choices.push({ name: `${tier}-${modInfo.name}`, value: `${tier}-${modInfo.name}` });
        }
    }
    // MCTiers, PvP Tiers, MCPVP platformuna göre filtreleme autocomplete'de yapılacak
    return choices.slice(0, 25); // Discord max 25
}

// ── Otomatik Test Kanalı Açma Fonksiyonu ──────────────────────────────────
// Sıradaki kişileri tester sayısı kadar test kanalına al
async function checkQueueAndOpenTest(mod, guild) {
    if (modeQueues[mod].length === 0) return;
    if (activeTestersByMode[mod].size === 0) return;
    
    // Açılabilecek kanal sayısı = tester sayısı - aktif test sayısı
    const openSlots = activeTestersByMode[mod].size - activeTests[mod].size;
    if (openSlots <= 0) return;

    const toOpen = Math.min(openSlots, modeQueues[mod].length);
    let queueChanged = false;
    for (let i = 0; i < toOpen; i++) {
        if (modeQueues[mod].length === 0) break;
        const targetID = modeQueues[mod].shift();
        queueChanged = true;
        try {
            const targetMember = await guild.members.fetch(targetID);
            const safeName = targetMember.user.username.replace(/[^a-z0-9]/gi, '').substring(0, 10) || "oyuncu";
            const channelName = `test-${mod}-${safeName}`;
            const channel = await guild.channels.create(channelName, { 
                parent: testCategoryID,
                permissionOverwrites: [
                    { id: guild.id, deny: ['VIEW_CHANNEL'] },
                    { id: targetID, allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'ATTACH_FILES'] },
                    { id: testerRoleID, allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'ATTACH_FILES'] },
                    { id: gameModes[mod].testerRole, allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'ATTACH_FILES'] }
                ]
            }).catch(e => {
                console.error("Test kanalı oluşturulurken hata: ", e);
                return null;
            });

            if (!channel) {
                // Kanal açılamadıysa oyuncuyu sıranın başına geri koy
                modeQueues[mod].unshift(targetID);
                break;
            }

            activeTests[mod].add(channel.id);

            const controlEmbed = new MessageEmbed()
                .setTitle(`${gameModes[mod].name} Test Talebi`)
                .setDescription(`**Yeni bir test talebi.**\n\nTalep Açan:\n<@${targetID}>`)
                .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true, size: 256 }))
                .setColor("#FFCC00");
                
            const selectRow = new MessageActionRow().addComponents(
                new MessageSelectMenu()
                    .setCustomId("btn_talep_islem")
                    .setPlaceholder("Talep İşlemleri")
                    .addOptions([{ label: "Kullanıcı Ekle", value: "add_user", emoji: "👤" }])
            );
            
            const controlRow = new MessageActionRow().addComponents(
                new MessageButton().setCustomId(`bclose:${mod}`).setLabel("Kanalını Kapat").setStyle("DANGER").setEmoji("❌"),
                new MessageButton().setCustomId("btn_voice").setLabel("Sesli Test").setStyle("SECONDARY").setEmoji("🔊"),
                new MessageButton().setCustomId("btn_claim").setLabel("Talebi Üstlen").setStyle("SUCCESS").setEmoji("📌")
            );
            
            await channel.send({
                content: `<@${targetID}> | <#${rulesChannelId}> Lütfen okuyalım.\n<@&${gameModes[mod].testerRole}> Yeni Test Açıldı!`,
                embeds: [controlEmbed],
                components: [selectRow, controlRow]
            });
        } catch(e) {
            console.error("Test kanalı oluşturulurken hata: ", e);
            modeQueues[mod].unshift(targetID);
        }
    }
    if (queueChanged) {
        markPanelDirty(mod);
        await updateQueuePanel(mod, guild);
    }
}

// ── Leaderboard mesaj verisi ───────────────────────────────────────────────
var leaderboardMsg = null; // bellekte tut
function saveLeaderboardData(messageId, channelId) {
    fs.writeFileSync("leaderboardData.json", JSON.stringify({ messageId, channelId }, null, 2));
}
function loadLeaderboardData() {
    try { return JSON.parse(fs.readFileSync("leaderboardData.json", "utf-8")); }
    catch(e) { return {}; }
}

// Leaderboard embed'ini güncelle
async function updateLeaderboard(guild) {
    if (!leaderboardMsg) return;
    try {
        const members = await guild.members.fetch();
        const scores = [];
        for (const [, member] of members) {
            if (member.user.bot) continue;
            const { score, tierCount } = calcMemberTierScore(member);
            if (tierCount === 0) continue;
            scores.push({ member, score, tierCount });
        }
        scores.sort((a, b) => b.score - a.score || b.tierCount - a.tierCount);
        const top10 = scores.slice(0, 10);

        const topMedals = ["🥇", "🥈", "🥉"];
        let desc = "";
        for (let i = 0; i < top10.length; i++) {
            const { member, score, tierCount } = top10[i];
            // En iyi tier adını bul
            let bestTierName = "—";
            let bestScore = 0;
            const allTiers = [];
            for (const [, role] of member.roles.cache) {
                const parts = role.name.split("-");
                if (parts.length < 2) continue;
                const tierPart = parts[0];
                if (TIER_SCORES[tierPart] !== undefined) {
                    allTiers.push(role.name);
                    if (TIER_SCORES[tierPart] > bestScore) {
                        bestScore = TIER_SCORES[tierPart];
                        bestTierName = role.name;
                    }
                }
            }
            const prefix  = i < 3 ? topMedals[i] : `**${i + 1}.**`;
            const tierStr = allTiers.length > 0 ? allTiers.join(" • ") : "—";
            desc += `${prefix} **${member.user.tag}**\n`;
            desc += `> 🏅 En İyi: \`${bestTierName}\` | 💎 Puan: \`${score}\` | 📋 Tiers: ${allTiers.length}\n`;
            desc += `> _${tierStr}_\n\n`;
        }
        if (!desc) desc = "_Henüz tier sahibi kimse yok._";

        const lbEmbed = new MessageEmbed()
            .setTitle("🏆 TR PvP Tierlist — Top 10 Leaderboard")
            .setDescription(desc)
            .setColor("#FFD700")
            .addFields(
                { name: "📊 Tier Puan Sistemi", value: "`HT1`=10 • `LT1`=9 • `HT2`=8 • `LT2`=7 • `HT3`=6 • `LT3`=5 • `HT4`=4 • `LT4`=3 • `HT5`=2 • `LT5`=1", inline: false }
            )
            .setFooter({ text: `${top10.length} oyuncu listelendi • Her 10 saniyede güncellenir` })
            .setTimestamp();

        await leaderboardMsg.edit({ embeds: [lbEmbed] }).catch(() => {});
    } catch(e) {
        console.error("Leaderboard güncelleme hatası:", e);
    }
}

// ── Bot Ready ──────────────────────────────────────────────────────────────
bot.on("ready", async () => {
    console.log(`[LOG]: ${bot.user.tag} - Sistem Güncellendi!`);
    
    // Panel mesajlarını yükle
    const panelData = getPanelData();
    for (const mod in panelData) {
        if (!gameModes[mod]) continue;
        try {
            const chan = await bot.channels.fetch(panelData[mod].channelId);
            const msg = await chan.messages.fetch(panelData[mod].messageId);
            if (msg) modeMessages[mod] = msg;
        } catch (e) {}
    }

    // Bot başlarken tüm panelleri hemen güncelle (yeni embed formatı uygulansın)
    {
        const startupGuild = bot.guilds.cache.first();
        if (startupGuild) {
            for (const mod in panelData) {
                if (!gameModes[mod]) continue;
                if (modeMessages[mod]) {
                    markPanelDirty(mod);
                    await updateQueuePanel(mod, startupGuild).catch(() => {});
                }
            }
        }
    }

    // Leaderboard mesajını yükle
    const lbData = loadLeaderboardData();
    if (lbData.messageId && lbData.channelId) {
        try {
            const lbChan = await bot.channels.fetch(lbData.channelId);
            leaderboardMsg = await lbChan.messages.fetch(lbData.messageId);
        } catch(e) { leaderboardMsg = null; }
    }

    const updatePresence = () => {
        const guild = bot.guilds.cache.first();
        if (guild) {
            bot.user.setActivity(`${guild.memberCount} Üye | TR PvP`, { type: "WATCHING" });
        }
    };
    updatePresence();
    setInterval(updatePresence, 300000);

    const guild = bot.guilds.cache.first();
    if (guild) {
        // Tüm tier seçenekleri (autocomplete) için statik liste
        const allTierChoices = [];
        const tierLabels = ["HT1","LT1","HT2","LT2","HT3","LT3","HT4","LT4","HT5","LT5"];
        for (const [, modInfo] of Object.entries(gameModes)) {
            for (const t of tierLabels) {
                allTierChoices.push({ name: `${t}-${modInfo.name}`, value: `${t}-${modInfo.name}` });
            }
        }

        await guild.commands.set([
            // ── Tester komutları ──
            {
                name: "testac",
                description: "Tester olarak aktif olursunuz.",
                options: [{ type: "STRING", name: "mod", description: "Aktif olacağınız mod", required: true, choices: Object.entries(gameModes).map(([k, v]) => ({ name: v.name, value: k })) }]
            },
            {
                name: "testkapa",
                description: "Tester listesinden çıkarsınız.",
                options: [{ type: "STRING", name: "mod", description: "Çıkacağınız mod", required: true, choices: Object.entries(gameModes).map(([k, v]) => ({ name: v.name, value: k })) }]
            },
            {
                name: "sonuc",
                description: "TR PvP Test Sonuç Raporu yayınlar.",
                options: [
                    { type: "USER",   name: "discord",     description: "Oyuncu Discord",          required: true },
                    { type: "STRING", name: "oyuncu-ismi", description: "Minecraft Oyuncu İsmi",   required: true },
                    { type: "STRING", name: "oyun-modu",   description: "Oyun Modu",               required: true, choices: Object.entries(gameModes).map(([k, v]) => ({ name: v.name, value: v.name })) },
                    { type: "STRING", name: "yeni-tier",   description: "Yeni Tier (Örn: LT5-Sword)", required: true, autocomplete: true },
                    { type: "STRING", name: "bolge",       description: "Bölge (Örn: TR, EU)",     required: true }
                ]
            },
            // ── Admin / Yönetici komutları ──
            { name: "sira-paneli",       description: "Moda özel sıra panelini kurar.",          options: [{ type: "STRING", name: "mod", description: "Oyun Modu", required: true, choices: Object.entries(gameModes).map(([k, v]) => ({ name: v.name, value: k })) }] },
            { name: "tierlist-paneli",   description: "Oyun modlarına ait rolleri alabilmeleri için Rol Alma panelini kurar." },
            { name: "testerstatik",      description: "Testerın tamamladığı test sayısını gösterir.", options: [{ type: "USER", name: "kullanici", description: "Tester", required: true }] },
            { name: "sira-cikar",        description: "Birini sıradan atar.",                    options: [{ type: "USER", name: "kullanici", description: "Üye", required: true }, { type: "STRING", name: "mod", description: "Mod Seçin", required: true, choices: Object.entries(gameModes).map(([k, v]) => ({ name: v.name, value: k })) }] },
            { name: "hile-list",         description: "Bir oyuncuyu hile listesine ekler.",       options: [{ type: "USER", name: "kullanici", description: "Hile yapan oyuncu", required: true }, { type: "STRING", name: "oyun-adi", description: "Minecraft Nick", required: true }, { type: "STRING", name: "sebep", description: "Yasaklanma Sebebi", required: true }, { type: "STRING", name: "sure", description: "Yasak Süresi", required: true }] },
            { name: "hilelist-kaldır",   description: "Bir oyuncuyu hile listesinden çıkarır.",  options: [{ type: "USER", name: "kullanici", description: "Çıkarılacak oyuncu", required: true }] },
            { name: "dm-gönder",         description: "Tüm üyelere DM yoluyla TR PvP duyurusu gönderir.", options: [{ type: "STRING", name: "başlık", description: "Duyuru Başlığı", required: true }, { type: "STRING", name: "mesaj", description: "Duyuru İçeriği", required: true }, { type: "STRING", name: "alt-metin", description: "Footer Metni", required: false }] },
            { name: "cooldown-ayarla-rol",  description: "Rol bazlı bekleme süresi ayarlar.",    options: [{ type: "ROLE", name: "rol", description: "Rol seçin", required: true }, { type: "STRING", name: "süre", description: "Örn: 12h, 1d", required: true }] },
            { name: "cooldown-ayarla-üye",  description: "Üye bazlı bekleme süresi ayarlar.",   options: [{ type: "USER", name: "üye", description: "Üye seçin", required: true }, { type: "STRING", name: "süre", description: "Örn: 12h, 1d", required: true }] },
            { name: "cooldown-sil-üye",     description: "Üyenin aktif bekleme süresini siler.", options: [{ type: "USER", name: "üye", description: "Üye seçin", required: true }] },
            { name: "cooldown-kapat",    description: "Sistemi kapatır." },
            { name: "cooldown-aç",       description: "Sistemi açar." },
            { name: "etiket-engelle",        description: "Birinin veya bir rolün etiketlenmesini engeller/açar.", options: [{ type: "USER", name: "kullanici", description: "Üye seçin", required: false }, { type: "ROLE", name: "rol", description: "Rol seçin", required: false }] },
            { name: "etiket-engelle-mevcut", description: "Etiket engellenmiş tüm kullanıcı ve rolleri listeler." },
            { name: "ticket-panel",      description: "Destek panelini kurar." },
            {
                name: "ticket-add",
                description: "Açık olan ticketa bir üyeyi ekler.",
                options: [{ type: "USER", name: "uye", description: "Eklenecek üye", required: true }]
            },
            {
                name: "ticket-remove",
                description: "Açık olan tickettan bir üyeyi çıkarır.",
                options: [{ type: "USER", name: "uye", description: "Çıkarılacak üye", required: true }]
            },
            // ── Yeni komutlar ──
            {
                name: "rol-ver",
                description: "Bir üyeye rol ver.",
                options: [
                    { type: "USER", name: "kullanici", description: "Rol verilecek üye", required: true },
                    { type: "ROLE", name: "rol",       description: "Verilecek rol",     required: true }
                ]
            },
            {
                name: "rol-al",
                description: "Bir üyeden rol al.",
                options: [
                    { type: "USER", name: "kullanici", description: "Rolü alınacak üye", required: true },
                    { type: "ROLE", name: "rol",       description: "Alınacak rol",     required: true }
                ]
            },
            {
                name: "uyarı",
                description: "Bir testerı uyarır.",
                options: [
                    { type: "USER", name: "tester", description: "Uyarılan tester", required: true },
                    { type: "STRING", name: "sebep", description: "Uyarı sebebi", required: true }
                ]
            },
            {
                name: "uyarı-sil",
                description: "Bir testerın uyarılarını siler.",
                options: [
                    { type: "USER", name: "tester", description: "Uyarıları silinecek tester", required: true }
                ]
            },
            {
                name: "testerlogkanal",
                description: "Tester log kanalını ayarlar.",
                options: [
                    { type: "CHANNEL", name: "kanal", description: "Log kanalı", required: true }
                ]
            },
            {
                name: "haftaliktester",
                description: "Haftanın testerını manuel seçer.",
                options: [
                    { type: "USER", name: "tester", description: "Tester", required: true },
                    { type: "STRING", name: "nick", description: "Oyun içi nick", required: true }
                ]
            },
            {
                name: "haftalikmevcut",
                description: "Haftalık tester sisteminin durumunu ve istatistikleri gösterir."
            },
            {
                name: "haftaliktester-ayar",
                description: "Haftalık otomatik tester seçimini açar veya kapatır.",
                options: [
                    { type: "STRING", name: "durum", description: "Aç veya Kapat", required: true, choices: [ { name: "Açık", value: "ac" }, { name: "Kapalı", value: "kapat" } ] }
                ]
            },
            {
                name: "tier-göç",
                description: "Başka bir platformdan tier göçürür.",
                options: [
                    { type: "USER",   name: "discord",   description: "Oyuncu Discord",             required: true },
                    { type: "STRING", name: "nick",      description: "Minecraft oyun içi isim",    required: true },
                    { type: "STRING", name: "platform",  description: "Kaynak platform",            required: true, choices: [
                        { name: "MCTiers",   value: "MCTIERS"   },
                        { name: "PvP Tiers", value: "PVPTIERS"  },
                        { name: "MCPVP",     value: "MCPVP"     }
                    ]},
                    { type: "STRING", name: "tier",      description: "Göç edilecek tier (Örn: LT3-Vanilla)", required: true, autocomplete: true }
                ]
            },
            {
                name: "leaderboard",
                description: "En iyi 10 oyuncuyu gösterir (her 10sn güncellenir)."
            },
            {
                name: "leaderboard-sil",
                description: "Aktif leaderboard mesajını siler."
            },
            {
                name: "tier-reset",
                description: "Belirtilen oyuncunun tüm tier rollerini sıfırlar.",
                options: [
                    { type: "USER", name: "kullanici", description: "Tierleri sıfırlanacak oyuncu", required: true }
                ]
            },
            {
                name: "tier-resetall",
                description: "Sunucudaki herkesin tüm tier rollerini sıfırlar."
            }
        ]);
    }
});

// ── Sıra Paneli Güncelleme (5sn) - SADECE dirty olanları güncelle ──────────
setInterval(async () => {
    const guild = bot.guilds.cache.first();
    if (!guild) return;
    for (const [key] of Object.entries(gameModes)) {
        // Sadece değişiklik işaretliyse veya mesaj varsa güncelle
        if (modeMessages[key] && _panelDirty[key]) {
            await updateQueuePanel(key, guild);
        }
    }
}, 5000);

// ── Leaderboard Güncelleme (30sn) - daha az sıklıkta ─────────────────────
setInterval(async () => {
    if (!leaderboardMsg) return;
    const guild = bot.guilds.cache.first();
    if (guild) await updateLeaderboard(guild);
}, 30000);

// ── Interaction Handler ────────────────────────────────────────────────────
bot.on("interactionCreate", async (interaction) => {

    // Autocomplete handler
    if (interaction.isAutocomplete()) {
        const focusedOption = interaction.options.getFocused(true);

        if (interaction.commandName === "sonuc" && focusedOption.name === "yeni-tier") {
            const selectedMod = interaction.options.getString("oyun-modu");
            if (!selectedMod) return interaction.respond([{ name: "Önce Oyun Modu Seçin", value: "Yok" }]);
            const tiers = ["LT5","HT5","LT4","HT4","LT3","HT3","LT2","HT2","LT1","HT1"];
            const roleNames = tiers.map(t => `${t}-${selectedMod}`);
            const filtered = roleNames.filter(r => r.toLowerCase().includes(focusedOption.value.toLowerCase()));
            return interaction.respond(filtered.map(c => ({ name: c, value: c })).slice(0, 25));
        }

        if (interaction.commandName === "tier-göç" && focusedOption.name === "tier") {
            const tiers = ["HT1","LT1","HT2","LT2","HT3","LT3","HT4","LT4","HT5","LT5"];
            const choices = [];
            for (const [, modInfo] of Object.entries(gameModes)) {
                for (const t of tiers) {
                    choices.push(`${t}-${modInfo.name}`);
                }
            }
            const filtered = choices.filter(c => c.toLowerCase().includes(focusedOption.value.toLowerCase()));
            return interaction.respond(filtered.map(c => ({ name: c, value: c })).slice(0, 25));
        }
        return;
    }

    const isTester = interaction.member.roles.cache.has(testerRoleID) || 
                     Object.values(gameModes).some(m => interaction.member.roles.cache.has(m.testerRole)) || 
                     interaction.member.permissions.has("ADMINISTRATOR");
    const isYonetici = interaction.member.roles.cache.has(yoneticiRol1) || interaction.member.roles.cache.has(yoneticiRol2) || interaction.member.permissions.has("ADMINISTRATOR");

    if (interaction.isCommand()) {
        const { commandName, options } = interaction;

        // ── /testac ────────────────────────────────────────────────────────
        if (commandName === "testac") {
            if (!isTester) return interaction.reply({ content: "❌ Bu komut sadece testerlar için.", ephemeral: true });
            const mod = options.getString("mod");
            activeTestersByMode[mod].add(interaction.user.id);
            
            // Guild'i önceden kaydet - reply sonrası null gelebilir!
            const cachedGuild = interaction.guild;
            await interaction.reply({ content: "✅ Aktif listeye eklendiniz.", ephemeral: true });
            
            sendTesterLog(bot, "🟢 Tester Aktif", `<@${interaction.user.id}>, **${mod}** modunda aktif oldu.`, "#2ecc71");
            markPanelDirty(mod);
            await updateQueuePanel(mod, cachedGuild);
            checkQueueAndOpenTest(mod, cachedGuild);
            return;
        }

        // ── /testkapa ──────────────────────────────────────────────────────
        if (commandName === "testkapa") {
            if (!isTester) return interaction.reply({ content: "❌ Bu komut sadece testerlar için.", ephemeral: true });
            const cikMod = options.getString("mod");
            activeTestersByMode[cikMod].delete(interaction.user.id);
            
            if (activeTestersByMode[cikMod].size === 0) {
                lastTestSessions[cikMod] = Date.now();
            }
            
            // Guild'i önceden kaydet!
            const cachedGuild2 = interaction.guild;
            await interaction.reply({ content: "✅ Aktif listeden çıktınız.", ephemeral: true });

            markPanelDirty(cikMod);
            await updateQueuePanel(cikMod, cachedGuild2);
            sendTesterLog(bot, "🔴 Tester Pasif", `<@${interaction.user.id}>, **${cikMod}** modundan çıktı.`, "#e74c3c");
            return;
        }

        // ── /sonuc ─────────────────────────────────────────────────────────
        if (commandName === "sonuc") {
            if (!isTester) return interaction.reply({ content: "❌ Bu komut sadece testerlar için.", ephemeral: true });
            await interaction.deferReply({ ephemeral: true });

            const user       = options.getUser("discord");
            const nickRaw    = options.getString("oyuncu-ismi");
            const modName    = options.getString("oyun-modu");
            const yeniTierName = options.getString("yeni-tier");
            const bolge      = options.getString("bolge");
            const targetMember = await interaction.guild.members.fetch(user.id);
            
            // Eski tierleri bul ve sil
            const oldTiers = targetMember.roles.cache.filter(r => {
                if (!r.name.startsWith("LT") && !r.name.startsWith("HT")) return false;
                const parts = r.name.split("-");
                if (parts.length < 2) return false;
                return parts.slice(1).join("-") === modName;
            });
            let eskiTierText = "UNranked";
            if (oldTiers.size > 0) {
                eskiTierText = oldTiers.map(r => r.name).join(", ");
                for (const [, role] of oldTiers) await targetMember.roles.remove(role).catch(() => {});
            }

            const tierRole = interaction.guild.roles.cache.find(r => r.name === yeniTierName);
            if (!tierRole) return interaction.editReply({ content: `❌ HATA: '${yeniTierName}' isminde bir rol bulunamadı!` });
            if (tierRole.permissions.has("ADMINISTRATOR")) return interaction.editReply({ content: "❌ HATA: Yönetici rolü verilemez!" });
            await targetMember.roles.add(tierRole).catch(console.error);

            saveTesterStat(interaction.user.id);
            
            const refreshedMember = await interaction.guild.members.fetch(user.id);
            const allTierRoles = refreshedMember.roles.cache
                .filter(r => r.name.startsWith("LT") || r.name.startsWith("HT"))
                .sort((a, b) => b.rawPosition - a.rawPosition)
                .map(r => `<@&${r.id}>`).join(" ");
            const tierRolDisplay = allTierRoles || "_Henüz tier yok_";

            // Skin URL - Mojang API ile hesap kontrolü; bulunamazsa mugm_
            const skinNick = await resolveNick(nickRaw);
            const thumbUrl = getSkinUrl(skinNick, "bust");

            const resEmbed = new MessageEmbed()
                .setAuthor({ name: `${nickRaw}'in Test Sonuçları 🏆` })
                .setColor("#FF69B4")
                .setThumbnail(thumbUrl)
                .addFields(
                    { name: 'Tester:',        value: `<@${interaction.user.id}>` },
                    { name: 'Bölge:',         value: `${bolge}` },
                    { name: 'Kullanıcı Adı:', value: `${nickRaw}` },
                    { name: 'Önceki Rank:',   value: `${eskiTierText}` },
                    { name: 'Kazanılan Rank:',value: `${yeniTierName}` }
                )
                .setFooter({ text: "[1.21+] TR PvP TL | Atılan sonuçlar yanlış ise destek açınız!" })
                .setTimestamp();
            
            let resultMsg;
            try {
                const resultChan = await interaction.guild.channels.fetch(sonucChannelId);
                resultMsg = resultChan
                    ? await resultChan.send({ content: `<@${user.id}>`, embeds: [resEmbed] })
                    : await interaction.channel.send({ content: `<@${user.id}>`, embeds: [resEmbed] });
            } catch(e) {
                resultMsg = await interaction.channel.send({ content: `<@${user.id}>`, embeds: [resEmbed] });
            }
            
            sendTesterLog(bot, "📋 Test Sonucu Yazıldı", `<@${interaction.user.id}>, <@${user.id}> kullanıcısına tier verdi.\n**Mod:** ${modName}\n**Eski Tier:** ${eskiTierText}\n**Yeni Tier:** ${yeniTierName}`, "#f1c40f");
            
            if (resultMsg) {
                for (const emoji of ["👑","🔥","⚔️","🎉","💀"]) {
                    await resultMsg.react(emoji).catch(() => {});
                }
            }

            const cld = getCooldownConfig(); // cache'ten oku
            let userCooldownSure = "4d";
            if (cld.users[user.id]) {
                userCooldownSure = cld.users[user.id];
            } else {
                for (const [roleID, rSure] of Object.entries(cld.roles)) {
                    if (targetMember.roles.cache.has(roleID)) { userCooldownSure = rSure; break; }
                }
            }
            let cdMs = ms(userCooldownSure);
            try {
                const wConf = getWeeklyTester(); // cache'ten oku
                if (wConf.currentTester === user.id) {
                    cdMs = cdMs * 0.6; // %40 azaltıldı
                }
            } catch(e){}

            testCooldowns.set(user.id, Date.now() + cdMs);
            return interaction.editReply({ content: "✅ Rapor işlendi ve Sonuç kanalına gönderildi." });
        }

        // ── /tier-göç ──────────────────────────────────────────────────────
        if (commandName === "tier-göç") {
            if (!isYonetici) return interaction.reply({ content: "❌ Bu komut için yetkiniz yok.", ephemeral: true });
            await interaction.deferReply({ ephemeral: false });

            const user      = options.getUser("discord");
            const nickRaw   = options.getString("nick");
            const platform  = options.getString("platform");
            const tierName  = options.getString("tier"); // Örn: "LT3-Vanilla"
            const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
            if (!targetMember) return interaction.editReply({ content: "❌ Kullanıcı sunucuda bulunamadı." });

            // Tier rolünü bul
            const tierRole = interaction.guild.roles.cache.find(r => r.name === tierName);
            if (!tierRole) return interaction.editReply({ content: `❌ '${tierName}' adında bir rol bulunamadı!` });
            if (tierRole.permissions.has("ADMINISTRATOR")) return interaction.editReply({ content: "❌ Yönetici rolü verilemez!" });

            // Aynı mod için eski tierleri sil
            const parts = tierName.split("-");
            const modNameForGoc = parts.slice(1).join("-"); // "Vanilla", "Spear Mace" vb.
            const oldTiersGoc = targetMember.roles.cache.filter(r => {
                if (!r.name.startsWith("LT") && !r.name.startsWith("HT")) return false;
                const p = r.name.split("-");
                if (p.length < 2) return false;
                return p.slice(1).join("-") === modNameForGoc;
            });
            for (const [, role] of oldTiersGoc) await targetMember.roles.remove(role).catch(() => {});
            await targetMember.roles.add(tierRole).catch(console.error);

            const skinNick = await resolveNick(nickRaw);
            const thumbUrl = getSkinUrl(skinNick, "bust");
            const fullUrl  = getSkinUrl(skinNick, "full");
            const now      = Math.floor(Date.now() / 1000);

            // Mesajda @ olmayacak - sadece metin olarak göster
            const platformNames = { MCTIERS: "MCTiers", PVPTIERS: "PvP Tiers", MCPVP: "MCPVP" };
            const platformDisplay = platformNames[platform] || platform;

            const gocEmbed = new MessageEmbed()
                .setTitle("🔄 Tier Göç Kaydı")
                .setColor("#9B59B6")
                .setThumbnail(thumbUrl)
                .setImage(fullUrl)
                .setDescription(
                    `**DC =** @${targetMember.user.username}` +
                    `\n**Göç edilen tier =** ${tierName}` +
                    `\n\n**TL =** ${platformDisplay}` +
                    `\u3000\u3000**Tarih =** <t:${now}:F>` +
                    `\n${"─".repeat(44)}`
                )
                .setFooter({ text: "TR PvP Tierlist System • Tier Göç" })
                .setTimestamp();

            await interaction.editReply({ embeds: [gocEmbed] });
        }

        // ── /tier-reset ────────────────────────────────────────────────────
        if (commandName === "tier-reset") {
            if (!isYonetici) return interaction.reply({ content: "❌ Bu komut için yetkiniz yok.", ephemeral: true });
            
            const targetUser = options.getUser("kullanici");
            const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (!targetMember) return interaction.reply({ content: "❌ Kullanıcı sunucuda bulunamadı.", ephemeral: true });

            const tierRoles = targetMember.roles.cache.filter(r => {
                if (!r.name.startsWith("LT") && !r.name.startsWith("HT")) return false;
                const parts = r.name.split("-");
                return parts.length >= 2;
            });

            if (tierRoles.size === 0) {
                return interaction.reply({ content: `⚠️ <@${targetUser.id}> kullanıcısının sıfırlanacak bir tier rolü bulunmuyor.`, ephemeral: true });
            }

            const embed = new MessageEmbed()
                .setTitle("⚠️ Tier Sıfırlama Onayı")
                .setDescription(`<@${targetUser.id}> kullanıcısının tüm tier rollerini (**${tierRoles.map(r => r.name).join(", ")}**) sıfırlamak istediğinize emin misiniz?`)
                .setColor("#f1c40f")
                .setTimestamp();

            const row = new MessageActionRow().addComponents(
                new MessageButton().setCustomId("confirm_reset").setLabel("Onayla").setStyle("SUCCESS").setEmoji("✅"),
                new MessageButton().setCustomId("cancel_reset").setLabel("İptal Et").setStyle("DANGER").setEmoji("❌")
            );

            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

            const filter = i => i.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 20000, max: 1 });

            collector.on("collect", async i => {
                if (i.customId === "confirm_reset") {
                    await i.deferUpdate();
                    try {
                        for (const [, role] of tierRoles) {
                            await targetMember.roles.remove(role).catch(() => {});
                        }
                        
                        // Sıraları güncelle (varsa sıradan çıkar)
                        for (const key of Object.keys(modeQueues)) {
                            const originalLength = modeQueues[key].length;
                            modeQueues[key] = modeQueues[key].filter(id => id !== targetUser.id);
                            if (modeQueues[key].length !== originalLength) {
                                markPanelDirty(key);
                                await updateQueuePanel(key, interaction.guild);
                            }
                        }
                        // Leaderboard güncelle
                        if (leaderboardMsg) {
                            await updateLeaderboard(interaction.guild);
                        }

                        await interaction.editReply({ 
                            content: `✅ <@${targetUser.id}> kullanıcısının tüm tierleri başarıyla sıfırlandı.`, 
                            embeds: [], 
                            components: [] 
                        });
                    } catch (err) {
                        await interaction.editReply({ content: "❌ Sıfırlama işlemi sırasında bir hata oluştu.", embeds: [], components: [] });
                    }
                } else {
                    await i.deferUpdate();
                    await interaction.editReply({ content: "❌ İşlem iptal edildi.", embeds: [], components: [] });
                }
            });

            collector.on("end", async (collected, reason) => {
                if (reason === "time") {
                    await interaction.editReply({ content: "⏰ İşlem zaman aşımına uğradı.", embeds: [], components: [] }).catch(() => {});
                }
            });
            return;
        }

        // ── /tier-resetall ─────────────────────────────────────────────────
        if (commandName === "tier-resetall") {
            if (!isYonetici) return interaction.reply({ content: "❌ Bu komut için yetkiniz yok.", ephemeral: true });

            const embed = new MessageEmbed()
                .setTitle("⚠️ KRİTİK UYARI: TÜM TİERLERİ SIFIRLAMA")
                .setDescription("Sunucudaki **HERKESİN** tüm oyun modlarındaki tier rollerini silmek istediğinize emin misiniz?\n\n**Bu işlem geri alınamaz!**")
                .setColor("#ff0000")
                .setTimestamp();

            const row = new MessageActionRow().addComponents(
                new MessageButton().setCustomId("confirm_resetall").setLabel("HERKESİ SIFIRLA").setStyle("DANGER").setEmoji("☠️"),
                new MessageButton().setCustomId("cancel_resetall").setLabel("Vazgeç").setStyle("SECONDARY").setEmoji("❌")
            );

            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

            const filter = i => i.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 30000, max: 1 });

            collector.on("collect", async i => {
                if (i.customId === "confirm_resetall") {
                    await i.deferUpdate();
                    await interaction.editReply({ content: "⏳ Sıfırlama işlemi başlatılıyor, lütfen bekleyin...", embeds: [], components: [] });

                    try {
                        const members = await interaction.guild.members.fetch();
                        let clearedCount = 0;
                        let failCount = 0;
                        let totalCount = 0;

                        for (const [id, member] of members) {
                            if (member.user.bot) continue;
                            totalCount++;
                            const rolesToRemove = member.roles.cache.filter(r => {
                                if (!r.name.startsWith("LT") && !r.name.startsWith("HT")) return false;
                                const parts = r.name.split("-");
                                return parts.length >= 2;
                            });

                            if (rolesToRemove.size > 0) {
                                try {
                                    for (const [, role] of rolesToRemove) {
                                        await member.roles.remove(role).catch(() => {});
                                    }
                                    clearedCount++;
                                } catch (err) {
                                    console.error(`Roles remove error for ${member.user.tag}:`, err);
                                    failCount++;
                                }
                                // Discord API rate-limit önleme
                                await new Promise(resolve => setTimeout(resolve, 200));
                            }
                        }

                        // Sıraları temizle & güncelle
                        for (const key of Object.keys(modeQueues)) {
                            modeQueues[key] = [];
                            markPanelDirty(key);
                            await updateQueuePanel(key, interaction.guild);
                        }

                        // Leaderboard güncelle
                        if (leaderboardMsg) {
                            await updateLeaderboard(interaction.guild);
                        }

                        await interaction.editReply({ 
                            content: `✅ **Tüm Tier Sıfırlama İşlemi Tamamlandı!**\n\n• Toplam taranan oyuncu: **${totalCount}**\n• Tierleri sıfırlanan oyuncu: **${clearedCount}**\n• Hata alan oyuncu sayısı: **${failCount}**`,
                            embeds: [],
                            components: []
                        });
                    } catch (err) {
                        await interaction.editReply({ content: "❌ Toplu sıfırlama işlemi sırasında bir hata oluştu.", embeds: [], components: [] });
                    }
                } else {
                    await i.deferUpdate();
                    await interaction.editReply({ content: "❌ İşlem iptal edildi.", embeds: [], components: [] });
                }
            });

            collector.on("end", async (collected, reason) => {
                if (reason === "time") {
                    await interaction.editReply({ content: "⏰ İşlem zaman aşımına uğradı.", embeds: [], components: [] }).catch(() => {});
                }
            });
            return;
        }

        // ── /rol-ver ───────────────────────────────────────────────────────
        if (commandName === "rol-ver") {
            if (!interaction.member.roles.cache.has(rolVerRoleId) && !interaction.member.permissions.has("ADMINISTRATOR")) {
                return interaction.reply({ content: "❌ Bu komutu kullanma yetkiniz yok.", ephemeral: true });
            }
            const targetUser = options.getUser("kullanici");
            const targetRole = options.getRole("rol");
            if (targetRole.permissions.has("ADMINISTRATOR")) {
                return interaction.reply({ content: "❌ Yönetici rolü verilemez!", ephemeral: true });
            }
            const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (!targetMember) return interaction.reply({ content: "❌ Kullanıcı bulunamadı.", ephemeral: true });
            await targetMember.roles.add(targetRole).catch(console.error);
            return interaction.reply({ content: `✅ <@${targetUser.id}> kullanıcısına **${targetRole.name}** rolü verildi.`, ephemeral: true });
        }

        // ── /rol-al ────────────────────────────────────────────────────────
        if (commandName === "rol-al") {
            if (!interaction.member.roles.cache.has(rolVerRoleId) && !interaction.member.permissions.has("ADMINISTRATOR")) {
                return interaction.reply({ content: "❌ Bu komutu kullanma yetkiniz yok.", ephemeral: true });
            }
            const targetUser = options.getUser("kullanici");
            const targetRole = options.getRole("rol");
            if (targetRole.permissions.has("ADMINISTRATOR")) {
                return interaction.reply({ content: "❌ Yönetici rolü alınamaz!", ephemeral: true });
            }
            const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (!targetMember) return interaction.reply({ content: "❌ Kullanıcı bulunamadı.", ephemeral: true });
            
            if (!targetMember.roles.cache.has(targetRole.id)) {
                return interaction.reply({ content: `❌ <@${targetUser.id}> kullanıcısında zaten **${targetRole.name}** rolü yok.`, ephemeral: true });
            }

            await targetMember.roles.remove(targetRole).catch(console.error);
            return interaction.reply({ content: `✅ <@${targetUser.id}> kullanıcısından **${targetRole.name}** rolü alındı.`, ephemeral: true });
        }

        // ── /uyarı ve /uyarı-sil ───────────────────────────────────────────
        if (commandName === "uyarı" || commandName === "uyarı-sil") {
            const hasUyariYetki = interaction.member.roles.cache.has("1514980839560188156") || interaction.member.roles.cache.has("1516515161089773736") || interaction.member.permissions.has("ADMINISTRATOR");
            if (!hasUyariYetki) return interaction.reply({ content: "❌ Bu komutu kullanma yetkiniz yok.", ephemeral: true });

            const testerUser = options.getUser("tester");
            const warningsDB = getTesterWarnings(); // cache'ten oku

            if (commandName === "uyarı") {
                const sebep = options.getString("sebep");
                if (!warningsDB[testerUser.id]) warningsDB[testerUser.id] = [];
                // Temizleme (süresi geçenler)
                warningsDB[testerUser.id] = warningsDB[testerUser.id].filter(w => w.expiry > Date.now());

                const expiry = Date.now() + (3 * 24 * 60 * 60 * 1000); // 3 days
                warningsDB[testerUser.id].push({ expiry, sebep });
                saveTesterWarningsData(warningsDB);

                const currentLvl = warningsDB[testerUser.id].length;
                const timestampSecs = Math.floor(expiry / 1000);

                try {
                    const uyariKanal = await interaction.guild.channels.fetch("1516846110226911313");
                    if (uyariKanal) {
                        await uyariKanal.send(`<@${testerUser.id}> "${sebep}" dolayı Uyarı seviyeni ${currentLvl} yaptın. ${currentLvl}/2 ⚠️\n_Uyarılar 3 gün sonra silinir: <t:${timestampSecs}:R>_`);
                    }
                } catch (e) {
                    console.error("Uyarı kanalına mesaj gönderilemedi:", e);
                }

                return interaction.reply({ content: `✅ <@${testerUser.id}> uyarıldı. (Seviye: ${currentLvl}/2)`, ephemeral: true });
            }

            if (commandName === "uyarı-sil") {
                if (warningsDB[testerUser.id]) {
                    delete warningsDB[testerUser.id];
                    saveTesterWarningsData(warningsDB);
                    return interaction.reply({ content: `✅ <@${testerUser.id}> kullanıcısının tüm uyarıları silindi.`, ephemeral: true });
                } else {
                    return interaction.reply({ content: `⚠️ <@${testerUser.id}> kullanıcısının uyarısı bulunmuyor.`, ephemeral: true });
                }
            }
        }

        // ── /testerlogkanal ────────────────────────────────────────────────
        if (commandName === "testerlogkanal") {
            if (!interaction.member.permissions.has("ADMINISTRATOR")) return interaction.reply({ content: "Yetkiniz yok.", ephemeral: true });
            const kanal = options.getChannel("kanal");
            const conf = { channelId: kanal.id };
            fs.writeFileSync("testerLogConfig.json", JSON.stringify(conf, null, 2));
            _testerLogConfig = conf; // cache güncelle
            _testerLogChannel = null; // log kanalını sıfırla, tekrar fetch edilsin
            return interaction.reply({ content: `✅ Tester log kanalı <#${kanal.id}> olarak ayarlandı.`, ephemeral: true });
        }

        // ── Haftalık Tester Komutları ──────────────────────────────────────
        if (commandName === "haftaliktester-ayar") {
            if (!interaction.member.permissions.has("ADMINISTRATOR")) return interaction.reply({ content: "Yetkiniz yok.", ephemeral: true });
            const durum = options.getString("durum");
            const conf = getWeeklyTester();
            conf.autoEnabled = (durum === "ac");
            saveWeeklyTester(conf);
            return interaction.reply({ content: `✅ Haftalık otomatik tester seçimi **${durum}** olarak ayarlandı.`, ephemeral: true });
        }

        if (commandName === "haftalikmevcut") {
            const conf = getWeeklyTester();
            const stats = getTesterStats();
            
            const durumText = conf.autoEnabled ? "Açık 🟢" : "Kapalı 🔴";
            let current = conf.currentTester ? `<@${conf.currentTester}>` : "Yok";
            
            let statList = Object.entries(stats).sort((a,b)=>b[1]-a[1]).slice(0, 10)
                .map((x,i) => `**${i+1}.** <@${x[0]}> - ${x[1]} Test`).join("\n") || "Henüz test yok.";

            const embed = new MessageEmbed()
                .setTitle("📅 Haftalık Tester Durumu")
                .setColor("#9b59b6")
                .setDescription(`**Otomatik Seçim:** ${durumText}\n**Şu Anki Haftanın Testerı:** ${current}\n\n**Bu Haftanın İstatistikleri:**\n${statList}`)
                .setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === "haftaliktester") {
            if (!interaction.member.permissions.has("ADMINISTRATOR")) return interaction.reply({ content: "Yetkiniz yok.", ephemeral: true });
            await interaction.deferReply({ ephemeral: true });
            
            const testerUser = options.getUser("tester");
            const nickRaw = options.getString("nick");
            
            const stats = getTesterStats();
            const testCount = stats[testerUser.id] || 0;

            const conf = getWeeklyTester();
            conf.currentTester = testerUser.id;
            saveWeeklyTester(conf);

            // İstatistikleri Sıfırla
            saveTesterStatsData({});

            const skinNick = await resolveNick(nickRaw);
            const thumbUrl = getSkinUrl(skinNick, "full");

            const nextWeek = Math.floor((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000);

            const embed = new MessageEmbed()
                .setAuthor({ name: "Haftanın Testerı", iconURL: testerUser.displayAvatarURL() })
                .setColor("#2b2d31")
                .setDescription(`Gösterdiği ilgiden dolayı ona 'Haftanın testerı' rolünü hediyemiz olarak öngösteriyoruz!\n\n| <t:${nextWeek}:R> haftanın yeni testerı seçilecek!\nCooldownu %40 azaltılmıştır.\n\n-----------------------------------`)
                .addFields(
                    { name: 'Tester:', value: `<@${testerUser.id}>`, inline: true },
                    { name: 'Bu hafta aldığı test sayısı:', value: `${testCount}`, inline: true }
                )
                .setImage(thumbUrl);

            try {
                const hKanal = await interaction.guild.channels.fetch("1516856260295659701");
                if (hKanal) await hKanal.send({ content: `<@${testerUser.id}>`, embeds: [embed] });
            } catch(e) {
                console.error("Haftalik tester kanalina mesaj atilamadi", e);
            }

            return interaction.editReply({ content: `✅ Haftanın testerı başarıyla <@${testerUser.id}> olarak seçildi.` });
        }

        // ── /leaderboard ───────────────────────────────────────────────────
        if (commandName === "leaderboard") {
            if (!isYonetici) return interaction.reply({ content: "❌ Bu komut için yetkiniz yok.", ephemeral: true });
            await interaction.deferReply({ ephemeral: true });

            const lbEmbed = new MessageEmbed()
                .setTitle("🏆 TR PvP Tierlist Leaderboard")
                .setDescription("_Leaderboard yükleniyor..._")
                .setColor("#FFD700")
                .setFooter({ text: "Her 30 saniyede güncellenir • HT1 = En İyi | LT5 = En Kötü" })
                .setTimestamp();

            const sentMsg = await interaction.channel.send({ embeds: [lbEmbed] });
            leaderboardMsg = sentMsg;
            saveLeaderboardData(sentMsg.id, interaction.channelId);

            // Hemen güncelle
            await updateLeaderboard(interaction.guild);
            return interaction.editReply({ content: "✅ Leaderboard kuruldu ve güncelleniyor." });
        }

        // ── /leaderboard-sil ───────────────────────────────────────────────
        if (commandName === "leaderboard-sil") {
            if (!isYonetici) return interaction.reply({ content: "❌ Bu komut için yetkiniz yok.", ephemeral: true });
            if (leaderboardMsg) {
                await leaderboardMsg.delete().catch(() => {});
                leaderboardMsg = null;
                fs.writeFileSync("leaderboardData.json", JSON.stringify({}));
                return interaction.reply({ content: "✅ Leaderboard mesajı silindi.", ephemeral: true });
            }
            return interaction.reply({ content: "⚠️ Aktif bir leaderboard mesajı bulunamadı.", ephemeral: true });
        }

        // ── /sira-paneli ───────────────────────────────────────────────────
        if (commandName === "sira-paneli") {
            if (!interaction.member.permissions.has("ADMINISTRATOR") && !isTester) return interaction.reply({ content: "Yetkiniz yok.", ephemeral: true });
            
            // Hemen cevap vererek API hatasını (timeout) önlüyoruz
            await interaction.reply({ content: "✅ Sıra paneli kuruluyor...", ephemeral: true });

            const mod = options.getString("mod");
            
            // 1) panelData'daki kayıtlı eski paneli sil
            const panelData = getPanelData();
            if (panelData[mod]) {
                try {
                    const oldChan = await bot.channels.fetch(panelData[mod].channelId);
                    const oldMsg  = await oldChan.messages.fetch(panelData[mod].messageId);
                    if (oldMsg) await oldMsg.delete().catch(() => {});
                } catch (e) {}
            }

            // 2) Kanaldaki son 50 mesajı tara, bottan gelen eski panel mesajlarını sil
            try {
                const fetched = await interaction.channel.messages.fetch({ limit: 50 });
                for (const [, m] of fetched) {
                    if (m.author.id === bot.user.id && m.id !== interaction.id) {
                        // Embed'i olan veya "paneli kuruluyor" içeren bot mesajlarını sil
                        const hasOldEmbed = m.embeds.some(e =>
                            e.title?.includes("Sırası") ||
                            e.description?.includes("Sıra Kapalı") ||
                            e.description?.includes("tester") ||
                            e.description?.includes("Aktif Tester")
                        );
                        const hasOldContent = m.content?.includes("paneli kuruluyor");
                        if (hasOldEmbed || hasOldContent) {
                            await m.delete().catch(() => {});
                        }
                    }
                }
            } catch (e) {}
            
            const initialMsg = await interaction.channel.send({ content: `${gameModes[mod].name} paneli kuruluyor...` });
            modeMessages[mod] = initialMsg;
            savePanelData(mod, initialMsg.id, interaction.channelId);
            markPanelDirty(mod);
            await updateQueuePanel(mod, interaction.guild);
        }

        // ── /tierlist-paneli ───────────────────────────────────────────────
        if (commandName === "tierlist-paneli") {
            if (!interaction.member.permissions.has("ADMINISTRATOR")) return interaction.reply({ content: "Yetkiniz yok.", ephemeral: true });
            const embed = new MessageEmbed()
                .setTitle("TierList Panel")
                .setDescription("Selam aşağıda test olmak istediğin Gamemodu seç.\n\n✨ **Available Gamemodes**\n🪓 AXE • 🔨 MACE • ☠️ NETHPOT • 💀 POT • 🌍 SMP • 🔱 SPEAR MACE • 🗡️ SWORD • 🪣 UHC • 🔮 VANILLA")
                .setColor("#2F3136");
            const selectMenu = new MessageSelectMenu()
                .setCustomId("select_gamemode_role")
                .setPlaceholder("Oyun Modu Seçin")
                .addOptions(Object.values(gameModes).map(v => ({ label: v.name, value: v.roleId, emoji: v.emoji })));
            await interaction.channel.send({ embeds: [embed], components: [new MessageActionRow().addComponents(selectMenu)] });
            return interaction.reply({ content: "TierList Rol paneli kuruldu.", ephemeral: true });
        }

        // ── /ticket-panel ──────────────────────────────────────────────────
        if (commandName === "ticket-panel") {
            if (!interaction.member.permissions.has("ADMINISTRATOR")) return interaction.reply({ content: "Yetkiniz yok.", ephemeral: true });
            const ticketEmbed = new MessageEmbed()
                .setTitle("TR PvP Destek")
                .setDescription("Destek talebi açmak için aşağıdaki 'Destek Aç' butonuna tıklamanız yeterlidir.\n\nTR PvP Network'ü tercih ettiğiniz için teşekkür ederiz!")
                .setColor("#FF0000")
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                .setFooter({ text: "TR PvP Destek Sistemi" });
            const row = new MessageActionRow().addComponents(
                new MessageButton().setCustomId("ticket_ac_ana").setLabel("Destek Aç").setStyle("PRIMARY").setEmoji("🎫")
            );
            const msg = await interaction.channel.send({ embeds: [ticketEmbed], components: [row] });
            const tData = getTicketData();
            tData.panelMsgID = msg.id;
            saveTicketData(tData);
            return interaction.reply({ content: "Panel kuruldu.", ephemeral: true });
        }

        // ── /ticket-add ──────────────────────────────────────────────────
        if (commandName === "ticket-add") {
            if (!interaction.channel.name.startsWith("ticket-")) return interaction.reply({ content: "❌ Bu komut sadece ticket kanallarında kullanılabilir.", ephemeral: true });
            if (!interaction.member.permissions.has("ADMINISTRATOR")) return interaction.reply({ content: "❌ Bu komutu sadece yöneticiler kullanabilir.", ephemeral: true });
            const uye = options.getUser("uye");
            await interaction.channel.permissionOverwrites.edit(uye.id, {
                VIEW_CHANNEL: true,
                SEND_MESSAGES: true,
                READ_MESSAGE_HISTORY: true
            });
            return interaction.reply({ content: `✅ ${uye} başarıyla bu ticketa eklendi.` });
        }

        // ── /ticket-remove ───────────────────────────────────────────────
        if (commandName === "ticket-remove") {
            if (!interaction.channel.name.startsWith("ticket-")) return interaction.reply({ content: "❌ Bu komut sadece ticket kanallarında kullanılabilir.", ephemeral: true });
            if (!interaction.member.permissions.has("ADMINISTRATOR")) return interaction.reply({ content: "❌ Bu komutu sadece yöneticiler kullanabilir.", ephemeral: true });
            const uye = options.getUser("uye");
            await interaction.channel.permissionOverwrites.edit(uye.id, {
                VIEW_CHANNEL: false
            });
            return interaction.reply({ content: `✅ ${uye} başarıyla bu tickettan çıkarıldı.` });
        }

        // ── /etiket-engelle ────────────────────────────────────────────────
        if (commandName === "etiket-engelle") {
            if (!interaction.member.permissions.has("ADMINISTRATOR")) return interaction.reply({ content: "❌ Bu komutu sadece yöneticiler kullanabilir.", ephemeral: true });
            const targetUser = options.getUser("kullanici");
            const targetRole = options.getRole("rol");
            const targetId   = targetUser?.id || targetRole?.id;
            if (!targetId) return interaction.reply({ content: "Lütfen bir kullanıcı veya rol belirtin.", ephemeral: true });
            let engelliler = getEtiketEngelliler();
            if (engelliler.includes(targetId)) {
                engelliler = engelliler.filter(id => id !== targetId);
                saveEtiketEngelliler(engelliler);
                const hedefAd = targetUser ? `<@${targetUser.id}>` : `<@&${targetRole.id}>`;
                return interaction.reply({ content: `✅ ${hedefAd} artık etiketlenebilir.`, ephemeral: true });
            } else {
                engelliler.push(targetId);
                saveEtiketEngelliler(engelliler);
                const hedefAd = targetUser ? `<@${targetUser.id}>` : `<@&${targetRole.id}>`;
                return interaction.reply({ content: `🚫 ${hedefAd} artık etiketlenemez!`, ephemeral: true });
            }
        }

        // ── /etiket-engelle-mevcut ─────────────────────────────────────────
        if (commandName === "etiket-engelle-mevcut") {
            if (!interaction.member.permissions.has("ADMINISTRATOR")) return interaction.reply({ content: "❌ Bu komutu sadece yöneticiler kullanabilir.", ephemeral: true });
            const engelliler = getEtiketEngelliler();
            if (engelliler.length === 0) {
                return interaction.reply({ content: "📋 Şu an etiket engeli olan kimse yok.", ephemeral: true });
            }
            const liste = engelliler.map((id, i) => `${i + 1}. <@${id}> veya <@&${id}> — ID: \`${id}\``).join("\n");
            const embed = new MessageEmbed()
                .setTitle("🚫 Etiket Engelli Listesi")
                .setDescription(liste)
                .setColor("#e74c3c")
                .setFooter({ text: `Toplam ${engelliler.length} kayıt` })
                .setTimestamp();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ── Cooldown komutları ──────────────────────────────────────────────
        if (["cooldown-ayarla-rol","cooldown-ayarla-üye","cooldown-sil-üye","cooldown-kapat","cooldown-aç"].includes(commandName)) {
            if (!interaction.member.permissions.has("ADMINISTRATOR")) return interaction.reply({ content: "Yetkiniz yok.", ephemeral: true });
            const cld = getCooldownConfig();
            if (commandName === "cooldown-ayarla-rol") {
                const rol = options.getRole("rol");
                cld.roles[rol.id] = options.getString("süre");
                saveCooldownConfig(cld);
                return interaction.reply({ content: `✅ **${rol.name}** rolü için süre **${options.getString("süre")}** olarak ayarlandı.`, ephemeral: true });
            }
            if (commandName === "cooldown-ayarla-üye") {
                const uye = options.getUser("üye");
                cld.users[uye.id] = options.getString("süre");
                saveCooldownConfig(cld);
                return interaction.reply({ content: `✅ <@${uye.id}> için özel süre **${options.getString("süre")}** olarak ayarlandı.`, ephemeral: true });
            }
            if (commandName === "cooldown-sil-üye") {
                testCooldowns.delete(options.getUser("üye").id);
                return interaction.reply({ content: `✅ Cooldown süresi silindi.`, ephemeral: true });
            }
            if (commandName === "cooldown-kapat") {
                cld.systemActive = false;
                saveCooldownConfig(cld);
                return interaction.reply({ content: "🚫 Cooldown sistemi kapatıldı.", ephemeral: true });
            }
            if (commandName === "cooldown-aç") {
                cld.systemActive = true;
                saveCooldownConfig(cld);
                return interaction.reply({ content: "✅ Cooldown sistemi açıldı.", ephemeral: true });
            }
        }

        // ── /dm-gönder ─────────────────────────────────────────────────────
        if (commandName === "dm-gönder") {
            if (!interaction.member.permissions.has("ADMINISTRATOR")) return interaction.reply({ content: "Yetkiniz yok.", ephemeral: true });
            const baslik  = options.getString("başlık");
            const mesaj   = options.getString("mesaj");
            const footer  = options.getString("alt-metin") || "TR PvP Duyuru Sistemi";
            const duyuruEmbed = new MessageEmbed().setAuthor({ name: `📢 ${baslik}` }).setColor("#5865F2").setDescription(mesaj).setFooter({ text: footer }).setTimestamp();
            await interaction.reply({ content: "🚀 Duyuru DM yoluyla üyelere gönderilmeye başlandı...", ephemeral: true });
            const members = await interaction.guild.members.fetch();
            let success = 0, failed = 0;
            for (const [, member] of members) {
                if (member.user.bot) continue;
                try { await member.send({ content: `**TR PvP Sunucusundan Duyuru!**`, embeds: [duyuruEmbed] }); success++; }
                catch (err) { failed++; }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            return interaction.followUp({ content: `✅ Duyuru tamamlandı.\nBaşarılı: ${success} | Başarısız: ${failed}`, ephemeral: true });
        }

        // ── /testerstatik ──────────────────────────────────────────────────
        if (commandName === "testerstatik") {
            const user  = options.getUser("kullanici");
            const stats = getTesterStats();
            const count = stats[user.id] || 0;
            return interaction.reply({ content: `📊 <@${user.id}> adlı tester toplamda **${count}** test sonucuna imza atmış.`, ephemeral: false });
        }

        // ── /sira-cikar ────────────────────────────────────────────────────
        if (commandName === "sira-cikar") {
            if (!isTester) return interaction.reply({ content: "Yetkiniz yok.", ephemeral: true });
            const user = options.getUser("kullanici");
            const mod  = options.getString("mod");
            if (!modeQueues[mod].includes(user.id)) return interaction.reply({ content: "Bu kullanıcı zaten sırada değil.", ephemeral: true });
            modeQueues[mod] = modeQueues[mod].filter(id => id !== user.id);
            markPanelDirty(mod);
            await updateQueuePanel(mod, interaction.guild);
            return interaction.reply({ content: `<@${user.id}>, **${gameModes[mod].name}** sırasından çıkarıldı.`, ephemeral: true });
        }

        // ── /hile-list ─────────────────────────────────────────────────────
        if (commandName === "hile-list") {
            if (!isTester) return interaction.reply({ content: "Yetkiniz yok.", ephemeral: true });
            await interaction.deferReply({ ephemeral: true });
            const user   = options.getUser("kullanici");
            const nickRaw = options.getString("oyun-adi");
            const hID    = "HL" + Math.floor(100000 + Math.random() * 900000);
            const m = await interaction.guild.members.fetch(user.id).catch(() => null);
            if (m) {
                await m.roles.add(hileRoleId).catch(() => {});
                const tierRoles = m.roles.cache.filter(r => r.name.startsWith("LT") || r.name.startsWith("HT"));
                for (const [, role] of tierRoles) await m.roles.remove(role).catch(() => {});
                for (const key of Object.keys(modeQueues)) {
                    const originalLength = modeQueues[key].length;
                    modeQueues[key] = modeQueues[key].filter(id => id !== user.id);
                    if (modeQueues[key].length !== originalLength) {
                        markPanelDirty(key);
                        await updateQueuePanel(key, interaction.guild);
                    }
                }
            }
            const skinNick = await resolveNick(nickRaw);
            const embed = new MessageEmbed()
                .setTitle("👑 🤢 💀 Hilelistesi Kaydı Oluşturuldu 💀 🤢 👑")
                .setDescription(`<@${user.id}> adlı oyuncu Hilelistesine eklendi ve **tüm tierleri silindi.**`)
                .setColor("#ff0000")
                .setThumbnail(getSkinUrl(skinNick, "bust"))
                .setImage(getSkinUrl(skinNick, "full"))
                .addFields(
                    { name: '👤 Oyuncu Bilgileri', value: `• **Discord:** <@${user.id}>\n• **Oyun İçi İsim:** ${nickRaw}\n• **Discord ID:** ${user.id}` },
                    { name: '🚨 Sebep(ler)',        value: `\`\`\` - ${options.getString("sebep")}\`\`\`` },
                    { name: '⏳ Süre Bilgileri',    value: `• **Verilen Süre:** ${options.getString("sure")}\n• **Giriş Sayısı:** 1`, inline: true },
                    { name: '👮 İşlem Bilgileri',   value: `• **Yönetici:** <@${interaction.user.id}>\n• **İşlem ID:** ${hID}`, inline: true }
                )
                .setFooter({ text: "TR PvP Hilelist Sistemi 👑 🤢 💀" })
                .setTimestamp();
            try {
                const chan = await bot.channels.fetch(hileLogChannelId);
                if (chan) await chan.send({ embeds: [embed] });
            } catch(e) { console.error("Hilelist kanalı hatası:", e); }
            return interaction.editReply({ content: "✅ Hile kaydı işlendi ve oyuncunun tierleri silindi." });
        }

        // ── /hilelist-kaldır ───────────────────────────────────────────────
        if (commandName === "hilelist-kaldır") {
            if (!isTester) return interaction.reply({ content: "Yetkiniz yok.", ephemeral: true });
            const targetUser = options.getUser("kullanici");
            const m = await interaction.guild.members.fetch(targetUser.id);
            if (m) { await m.roles.remove(hileRoleId); return interaction.reply({ content: "Hile rolü başarıyla kaldırıldı.", ephemeral: true }); }
        }
    }

    // ── Select Menu ────────────────────────────────────────────────────────
    if (interaction.isSelectMenu()) {
        if (interaction.customId === "select_gamemode_role") {
            const roleId = interaction.values[0];
            const role   = interaction.guild.roles.cache.get(roleId);
            if (!role) return interaction.reply({ content: "Rol bulunamadı.", ephemeral: true });
            if (interaction.member.roles.cache.has(roleId)) {
                await interaction.member.roles.remove(roleId).catch(() => {});
                return interaction.reply({ content: `❌ ${role.name} rolü üzerinizden alındı.`, ephemeral: true });
            } else {
                await interaction.member.roles.add(roleId).catch(() => {});
                return interaction.reply({ content: `✅ ${role.name} rolü başarıyla verildi.`, ephemeral: true });
            }
        }

        if (interaction.customId === "ticket_kategori_sec") {
            const kategori = interaction.values[0];
            
            // Kullanıcının ard arda tıklamasını engellemek için anında mesajı düzenle/sil
            await interaction.update({ content: "⏳ Destek talebiniz oluşturuluyor...", embeds: [], components: [] });
            
            try {
                const channel  = await interaction.guild.channels.create(`ticket-${interaction.user.username}`, {
                    parent: ticketCategoryID,
                    permissionOverwrites: [
                        { id: interaction.guild.id,  deny:  ['VIEW_CHANNEL'] },
                        { id: interaction.user.id,   allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'ATTACH_FILES'] },
                        { id: testerRoleID,          allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'ATTACH_FILES'] }
                    ]
                });
                const controlEmbed = new MessageEmbed()
                    .setTitle(`${kategori}`)
                    .setDescription(`**Yeni bir destek talebi.**\n\nTalep Açan:\n<@${interaction.user.id}>`)
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
                    .setColor("#FFCC00");
                const selectRow  = new MessageActionRow().addComponents(new MessageSelectMenu().setCustomId("btn_talep_islem").setPlaceholder("Talep İşlemleri").addOptions([{ label: "Üye Ekle", value: "add_user", emoji: "👤" }]));
                const controlRow = new MessageActionRow().addComponents(new MessageButton().setCustomId("btn_close_ticket").setLabel("Kanalını Kapat").setStyle("DANGER").setEmoji("❌"));
                await channel.send({ content: `<@${interaction.user.id}> | Destek Talebi`, embeds: [controlEmbed], components: [selectRow, controlRow] });
                
                // Mesajı zaten güncellediğimiz için editReply ile veya sessizce işlemi bitiriyoruz.
                // await interaction.editReply({ content: `✅ Kanal açıldı: ${channel}` }); // Opsiyonel
            } catch (e) {
                console.error("Ticket açma hatası:", e);
                // await interaction.editReply({ content: "❌ Ticket açılırken hata oluştu." });
            }
        }

        if (interaction.customId === "btn_talep_islem" && interaction.values[0] === "add_user") {
            const isTesterLocal = interaction.member.roles.cache.has(testerRoleID) || 
                                  Object.values(gameModes).some(m => interaction.member.roles.cache.has(m.testerRole)) || 
                                  interaction.member.permissions.has("ADMINISTRATOR");
            if (!isTesterLocal) return interaction.reply({ content: "Yetkiniz yok.", ephemeral: true });
            await interaction.reply({ content: "Lütfen eklemek istediğiniz kullanıcının ID'sini kanala yazın.", ephemeral: true });
            const collector = interaction.channel.createMessageCollector({ filter: m => m.author.id === interaction.user.id, time: 15000, max: 1 });
            collector.on('collect', async m => {
                const targetId = m.content.replace(/[<@!>]/g, "");
                try {
                    await interaction.channel.permissionOverwrites.create(targetId, { VIEW_CHANNEL: true, SEND_MESSAGES: true, ATTACH_FILES: true });
                    m.delete().catch(() => {});
                    interaction.channel.send({ content: `✅ <@${targetId}> başarıyla kanala eklendi.` });
                } catch(e) {
                    interaction.channel.send({ content: "❌ Hata: Geçerli bir kullanıcı ID'si girilmedi." });
                }
            });
        }
    }

    // ── Button ─────────────────────────────────────────────────────────────
    if (interaction.isButton()) {
        const isTesterBtn = interaction.member.roles.cache.has(testerRoleID) || 
                            Object.values(gameModes).some(m => interaction.member.roles.cache.has(m.testerRole)) || 
                            interaction.member.permissions.has("ADMINISTRATOR");

        if (interaction.customId === "ticket_ac_ana") {
            const catEmbed = new MessageEmbed()
                .setAuthor({ name: "TR PvP Destek Sistemi", iconURL: interaction.guild.iconURL() })
                .setDescription("Aşağıdaki menüden uygun destek kategorisini seçiniz.")
                .setColor("#2F3136").setTimestamp();
            const catRow = new MessageActionRow().addComponents(
                new MessageSelectMenu().setCustomId("ticket_kategori_sec").setPlaceholder("Lütfen bir destek kategorisi seçiniz!").addOptions([
                    { label: "Yüksek Test",       value: "Yüksek Test",       emoji: "🏆" },
                    { label: "Genel",             value: "Genel",             emoji: "🛠" },
                    { label: "Yetkili Başvuru",   value: "Yetkili Başvuru",   emoji: "📋" },
                    { label: "Partner",           value: "Partner",           emoji: "🤝" },
                    { label: "Test",              value: "Test",              emoji: "⚔️" },
                    { label: "Yetkili Şikayet",  value: "Yetkili Şikayet",  emoji: "⛔" }
                ])
            );
            return interaction.reply({ embeds: [catEmbed], components: [catRow], ephemeral: true });
        }

        if (interaction.customId.startsWith("join_")) {
            const key = interaction.customId.split("_")[1];
            if (interaction.member.roles.cache.has(hileRoleId)) return interaction.reply({ content: "⚠️ Hilelistesinde bulunduğunuz için sıraya giremezsiniz.", ephemeral: true });
            const cld = getCooldownConfig(); // cache'ten oku
            if (cld.systemActive && testCooldowns.has(interaction.user.id) && testCooldowns.get(interaction.user.id) > Date.now()) {
                const kalanMs  = testCooldowns.get(interaction.user.id) - Date.now();
                const kalanGun = Math.floor(kalanMs / (1000 * 60 * 60 * 24));
                const kalanSaat = Math.floor((kalanMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const kalanDk  = Math.floor((kalanMs % (1000 * 60 * 60)) / (1000 * 60));
                return interaction.reply({ content: `⚠️ Bekleme süreniz dolmadı! Kalan: **${kalanGun}g ${kalanSaat}s ${kalanDk}dk**`, ephemeral: true });
            }
            if (!modeQueues[key].includes(interaction.user.id)) {
                modeQueues[key].push(interaction.user.id);
                await interaction.reply({ content: "✅ Sıraya başarıyla girildi.", ephemeral: true });
                markPanelDirty(key);
                await updateQueuePanel(key, interaction.guild);
                checkQueueAndOpenTest(key, interaction.guild);
            } else {
                return interaction.reply({ content: "Zaten sıradasınız.", ephemeral: true });
            }
        }

        if (interaction.customId === "check_cooldown") {
            const cd = testCooldowns.get(interaction.user.id);
            if (!cd || cd < Date.now()) return interaction.reply({ content: "Herhangi bir bekleme süreniz bulunmuyor!", ephemeral: true });
            const kalanMs = cd - Date.now();
            const gun  = Math.floor(kalanMs / (1000 * 60 * 60 * 24));
            const saat = Math.floor((kalanMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const dk   = Math.floor((kalanMs % (1000 * 60 * 60)) / (1000 * 60));
            return interaction.reply({ content: `Sıraya girmek için kalan süreniz: **${gun} gün ${saat} saat ${dk} dakika.**`, ephemeral: true });
        }

        if (interaction.customId.startsWith("bclose:")) {
            if (!isTesterBtn) return interaction.reply({ content: "Yetkiniz yok.", ephemeral: true });
            const mod = interaction.customId.split(":")[1] || null;
            if (mod && activeTests[mod]) activeTests[mod].delete(interaction.channelId);
            const voiceCh = interaction.guild.channels.cache.find(c => c.name === `sesli-${interaction.channel.name}`);
            if (voiceCh) await voiceCh.delete().catch(() => {});
            
            sendTesterLog(bot, "🗑️ Test Kanalı Kapatıldı", `<@${interaction.user.id}> testerı **${interaction.channel.name}** kanalını kapattı.`, "#95a5a6");
            
            await interaction.reply("Kanal 3 saniye içinde siliniyor...");
            const savedGuild = interaction.guild;
          
            setTimeout(async () => {
                interaction.channel.delete().catch(() => {});
                if (mod) {
                    markPanelDirty(mod);
                    await updateQueuePanel(mod, savedGuild);
                    checkQueueAndOpenTest(mod, savedGuild);
                }
            }, 3000);
        }

        if (interaction.customId === "btn_close_ticket") {
            if (!isTesterBtn) return interaction.reply({ content: "Yetkiniz yok.", ephemeral: true });
            await interaction.reply("Kanal 3 saniye içinde siliniyor...");
            setTimeout(() => { interaction.channel.delete().catch(() => {}); }, 3000);
        }

        if (interaction.customId === "btn_claim") {
            if (!isTesterBtn) return interaction.reply({ content: "Yetkiniz yok.", ephemeral: true });
            return interaction.channel.send({ content: `📌 Talebi üstlenen: <@${interaction.user.id}>` });
        }

        if (interaction.customId === "btn_voice") {
            if (!isTesterBtn) return interaction.reply({ content: "Yetkiniz yok.", ephemeral: true });
            const voiceChannel = await interaction.guild.channels.create(`sesli-${interaction.channel.name}`, {
                type: 'GUILD_VOICE', parent: testCategoryID,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: ['CONNECT', 'VIEW_CHANNEL'] },
                    { id: interaction.channel.permissionOverwrites.cache.filter(p => p.type === 'member').first()?.id || interaction.user.id, allow: ['VIEW_CHANNEL', 'CONNECT'] },
                    { id: testerRoleID, allow: ['VIEW_CHANNEL', 'CONNECT'] }
                ]
            });
            return interaction.reply({ content: `🔊 Sesli talep kanalı açıldı: ${voiceChannel}`, ephemeral: true });
        }
    }
});

// ── Message Create (etiket engeli) ─────────────────────────────────────────
bot.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;
    // Çift uyarı önleme
    if (processedWarnings.has(message.id)) return;

    // Cache'ten oku - her mesajda disk I/O yok
    const engelliler = getEtiketEngelliler();
    if (engelliler.length === 0) return; // hızlı çıkış

    const blocked =
        message.mentions.users.some(u => engelliler.includes(u.id)) ||
        message.mentions.roles.some(r => engelliler.includes(r.id));
    if (blocked) {
        processedWarnings.add(message.id);
        setTimeout(() => processedWarnings.delete(message.id), 5000);
        try {
            await message.delete().catch(() => {});
            const uyari = await message.channel.send(`🚫 **UYARI:** Bu kişiyi/rolü etiketlemek yasaktır!`);
            setTimeout(() => uyari.delete().catch(() => {}), 4000);
        } catch (err) {}
    }
});

// ── WEB API SUNUCUSU ───────────────────────────────────────────────────────
// Website için Discord rol verisini JSON olarak sunar.
// Erişim: http://localhost:3001
const API_PORT = process.env.PORT || 3001;
const path = require("path");

const TIER_SCORES_API = {
    HT1: 10, LT1: 9,
    HT2: 8,  LT2: 7,
    HT3: 6,  LT3: 5,
    HT4: 4,  LT4: 3,
    HT5: 2,  LT5: 1
};

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".js":   "application/javascript; charset=utf-8",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".ico":  "image/x-icon",
    ".svg":  "image/svg+xml"
};

const apiServer = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

    // ── /api/players endpoint ─────────────────────────────────────────────
    if (req.url === "/api/players" && req.method === "GET") {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        try {
            const guild = bot.guilds.cache.first();
            if (!guild) {
                res.writeHead(503);
                return res.end(JSON.stringify({ error: "Bot henüz sunucuya bağlanmadı." }));
            }
            const members = await guild.members.fetch();
            const players = [];
            for (const [, member] of members) {
                if (member.user.bot) continue;
                const tiers = [];
                for (const [, role] of member.roles.cache) {
                    const parts = role.name.split("-");
                    if (parts.length < 2) continue;
                    const tierPart = parts[0];
                    if (TIER_SCORES_API[tierPart] === undefined) continue;
                    const modePart = parts.slice(1).join("-");
                    tiers.push({ tier: tierPart, mode: modePart });
                }
                if (tiers.length === 0) continue;
                const score = tiers.reduce((s, t) => s + (TIER_SCORES_API[t.tier] || 0), 0);
                players.push({
                    id:       member.user.id,
                    nick:     member.displayName,
                    username: member.user.username,
                    avatar:   member.user.displayAvatarURL({ format: "png", size: 64 }),
                    region:   "TR",
                    tiers,
                    score
                });
            }
            players.sort((a, b) => b.score - a.score);
            res.writeHead(200);
            return res.end(JSON.stringify({ players, updatedAt: new Date().toISOString() }));
        } catch (err) {
            console.error("[API HATA]", err);
            res.writeHead(500);
            return res.end(JSON.stringify({ error: "Sunucu hatası: " + err.message }));
        }
    }

    // ── Statik dosya sunucu (website/ klasörü) ────────────────────────────
    const websiteDir = path.join(__dirname, "website");
    let reqPath = req.url.split("?")[0];
    if (reqPath === "/") reqPath = "/index.html";
    // Güvenlik: path traversal önleme
    reqPath = reqPath.replace(/\.\./g, "");
    const fullPath = path.join(websiteDir, reqPath);
    const ext  = path.extname(fullPath).toLowerCase();
    const mime = MIME_TYPES[ext] || "text/plain; charset=utf-8";

    fs.readFile(fullPath, (err, data) => {
        if (err) {
            res.writeHead(404, { "Content-Type": "text/plain" });
            return res.end("404 - Dosya bulunamadi: " + reqPath);
        }
        res.writeHead(200, { "Content-Type": mime });
        res.end(data);
    });
});

apiServer.listen(API_PORT, () => {
    console.log(`[WEB] Site: http://localhost:${API_PORT}`);
    console.log(`[API] API:  http://localhost:${API_PORT}/api/players`);
});

bot.login(config.token);

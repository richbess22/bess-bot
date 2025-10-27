// main.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const { Storage, File } = require('megajs');
const os = require('os');
const axios = require('axios');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason,
  jidDecode,
  getContentType
} = require('@whiskeysockets/baileys');
const yts = require('yt-search');

const storageAPI = require('./file-storage');

// Bot Configuration
const BOT_CONFIG = {
    admin: '255612491554',
    channel_jid: '120363422610520277@newsletter',
    channel_name: 'SILA TECH',
    group_link: 'https://chat.whatsapp.com/GoavLtSBgRoAvmJfSgaOgg',
    channel_link: 'https://whatsapp.com/channel/0029VbBPxQTJUM2WCZLB6j28',
    bot_image: 'https://files.catbox.moe/ebj284.jpg'
};

const OWNER_NUMBERS = (process.env.OWNER_NUMBERS || '255612491554').split(',').filter(Boolean);
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || '255612491554';
const FORWARD_CHANNEL_JID = '120363422610520277@newsletter';
const AUTO_JOIN_GROUP = 'https://chat.whatsapp.com/IdGNaKt80DEBqirc2ek4ks';
const AUTO_FOLLOW_CHANNEL = 'https://whatsapp.com/channel/0029VbBPxQTJUM2WCZLB6j28';

// Auto Features Settings
const AUTO_FEATURES = {
    ALWAYS_ONLINE: true,
    AUTO_TYPING: true, 
    AUTO_RECORD: true, 
    AUTO_VIEW_STATUS: true, 
    AUTO_LIKE_STATUS: true,
    AUTO_REACT: false,
    AUTO_VIEW_STORY: true, 
    AUTO_REPLY_STATUS: true, 
    AUTO_AI_REPLY_STATUS: true, 
    ANTLINK: true,
    ANTDELETE: true
};

const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = path.resolve(process.env.SESSION_BASE_PATH || './session');

fs.ensureDirSync(SESSION_BASE_PATH);

// Font style function
function applyFont(text) {
    const fontMapping = {
        'a': '𝚊', 'b': '𝚋', 'c': '𝚌', 'd': '𝚍', 'e': '𝚎', 'f': '𝚏', 'g': '𝚐', 'h': '𝚑', 'i': '𝚒', 'j': '𝚓', 'k': '𝚔', 'l': '𝚕', 'm': '𝚖',
        'n': '𝚗', 'o': '𝚘', 'p': '𝚙', 'q': '𝚚', 'r': '𝚛', 's': '𝚜', 't': '𝚝', 'u': '𝚞', 'v': '𝚟', 'w': '𝚠', 'x': '𝚡', 'y': '𝚢', 'z': '𝚣',
        'A': '𝙰', 'B': '𝙱', 'C': '𝙲', 'D': '𝙳', 'E': '𝙴', 'F': '𝙵', 'G': '𝙶', 'H': '𝙷', 'I': '𝙸', 'J': '𝙹', 'K': '𝙺', 'L': '𝙻', 'M': '𝙼',
        'N': '𝙽', 'O': '𝙾', 'P': '𝙿', 'Q': '𝚀', 'R': '𝚁', 'S': '𝚂', 'T': '𝚃', 'U': '𝚄', 'V': '𝚅', 'W': '𝚆', 'X': '𝚇', 'Y': '𝚈', 'Z': '𝚉',
        '0': '𝟶', '1': '𝟷', '2': '𝟸', '3': '𝟹', '4': '𝟺', '5': '𝟻', '6': '𝟼', '7': '𝟽', '8': '𝟾', '9': '𝟿'
    };
    
    return text.split('').map(char => fontMapping[char] || char).join('');
}

// Send message with template
async function sendWithTemplate(socket, chatId, content, quoted = null) {
    try {
        const defaultContext = {
            externalAdReply: {
                title: "𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸",
                body: "𝙿𝙾𝚆𝙴𝚁𝙴𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸",
                thumbnailUrl: BOT_CONFIG.bot_image,
                sourceUrl: BOT_CONFIG.channel_jid,
                mediaType: 1,
                renderLargerThumbnail: true
            }
        };

        if (content.text) {
            content.text = applyFont(content.text);
        }
        if (content.caption) {
            content.caption = applyFont(content.caption);
        }

        const messageOptions = { 
            ...content,
            contextInfo: {
                ...defaultContext,
                ...content.contextInfo
            }
        };

        if (quoted) {
            return await socket.sendMessage(chatId, messageOptions, { quoted });
        } else {
            return await socket.sendMessage(chatId, messageOptions);
        }
    } catch (error) {
        console.error('Send template error:', error);
        throw error;
    }
}

function isBotOwner(jid, number, socket) {
    try {
        const cleanNumber = (number || '').replace(/\D/g, '');
        const cleanJid = (jid || '').replace(/\D/g, '');
        const decoded = jidDecode(socket.user?.id) || {};
        const bot = decoded.user;
        if (bot === number) return true;
        return OWNER_NUMBERS.some(owner => cleanNumber.endsWith(owner) || cleanJid.endsWith(owner));
    } catch (err) {
        return false;
    }
}

function getQuotedText(quotedMessage) {
    if (!quotedMessage) return '';

    if (quotedMessage.conversation) return quotedMessage.conversation;
    if (quotedMessage.extendedTextMessage?.text) return quotedMessage.extendedTextMessage.text;
    if (quotedMessage.imageMessage?.caption) return quotedMessage.imageMessage.caption;
    if (quotedMessage.videoMessage?.caption) return quotedMessage.videoMessage.caption;
    if (quotedMessage.buttonsMessage?.contentText) return quotedMessage.buttonsMessage.contentText;
    if (quotedMessage.listMessage?.description) return quotedMessage.listMessage.description;
    if (quotedMessage.listMessage?.title) return quotedMessage.listMessage.title;
    if (quotedMessage.listResponseMessage?.singleSelectReply?.selectedRowId) return quotedMessage.listResponseMessage.singleSelectReply.selectedRowId;
    if (quotedMessage.templateButtonReplyMessage?.selectedId) return quotedMessage.templateButtonReplyMessage.selectedId;
    if (quotedMessage.reactionMessage?.text) return quotedMessage.reactionMessage.text;

    if (quotedMessage.viewOnceMessage) {
        const inner = quotedMessage.viewOnceMessage.message;
        if (inner?.imageMessage?.caption) return inner.imageMessage.caption;
        if (inner?.videoMessage?.caption) return inner.videoMessage.caption;
        if (inner?.imageMessage) return '[view once image]';
        if (inner?.videoMessage) return '[view once video]';
    }

    if (quotedMessage.stickerMessage) return '[sticker]';
    if (quotedMessage.audioMessage) return '[audio]';
    if (quotedMessage.documentMessage?.fileName) return quotedMessage.documentMessage.fileName;
    if (quotedMessage.contactMessage?.displayName) return quotedMessage.contactMessage.displayName;

    return '';
}

// Auto Bio Function
async function updateAutoBio(socket) {
    try {
        const bios = [
            "🤖 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸 𝙸𝚂 𝙰𝙲𝚃𝙸𝚅𝙴",
            "🚀 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸 𝙸𝚂 𝙻𝙸𝚅𝙴",
            "💫 𝙿𝙾𝚆𝙴𝚁𝙴𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝚃𝙴𝙲𝙷",
            "⚡ 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸 - 𝙼𝙾𝚂𝚃 𝙿𝙾𝚆𝙴𝚁𝙵𝚄𝙻 𝙱𝙾𝚃",
            "🎯 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸 - 𝙿𝚁𝙴𝙼𝙸𝚄𝙼 𝙵𝙴𝙰𝚃𝚄𝚁𝙴𝚂",
            "🔥 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸 - 𝙾𝙽𝙻𝙸𝙽𝙴 & 𝙰𝙲𝚃𝙸𝚅𝙴",
            "🌟 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸 - 𝙰𝙳𝚅𝙰𝙽𝙲𝙴𝙳 𝙰𝙸 𝙱𝙾𝚃"
        ];
        
        const randomBio = bios[Math.floor(Math.random() * bios.length)];
        await socket.updateProfileStatus(randomBio);
        console.log('🔄 Auto bio updated:', randomBio);
    } catch (error) {
        console.error('Auto bio error:', error);
    }
}

// View Once Handler
async function handleViewOnce(socket, msg) {
    try {
        if (msg.message?.viewOnceMessageV2) {
            const viewOnceMsg = msg.message.viewOnceMessageV2.message;
            const messageType = Object.keys(viewOnceMsg)[0];
            
            let caption = `*🔒 𝚅𝙸𝙴𝚆 𝙾𝙽𝙲𝙴 𝙼𝙴𝚂𝚂𝙰𝙶𝙴 𝙳𝙴𝚃𝙴𝙲𝚃𝙴𝙳*\n\n`;
            caption += `*𝚃𝚢𝚙𝚎:* ${messageType.replace('Message', '').toUpperCase()}\n`;
            caption += `*𝙵𝚛𝚘𝚖:* ${msg.key.remoteJid}\n`;
            caption += `*𝚃𝚒𝚖𝚎:* ${new Date().toLocaleString()}\n\n`;
            caption += `*➥ 𝙿𝙾𝚆𝙴𝚁𝙴𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸*`;

            // Forward to admin
            if (ADMIN_NUMBER) {
                await sendWithTemplate(socket, `${ADMIN_NUMBER}@s.whatsapp.net`, {
                    text: caption
                });
            }

            // Save the media if it's image or video
            if (messageType === 'imageMessage' || messageType === 'videoMessage') {
                const media = viewOnceMsg[messageType];
                const buffer = await socket.downloadMediaMessage(msg);
                
                if (buffer) {
                    const mediaDir = './viewonce_media';
                    await fs.ensureDir(mediaDir);
                    const filename = `${msg.key.id}_${Date.now()}.${messageType === 'imageMessage' ? 'jpg' : 'mp4'}`;
                    const filepath = path.join(mediaDir, filename);
                    await fs.writeFile(filepath, buffer);
                    
                    console.log(`💾 View once media saved: ${filepath}`);
                }
            }
        }
    } catch (error) {
        console.error('View once handler error:', error);
    }
}

// Anti-link Handler
async function handleAntiLink(socket, msg) {
    try {
        const messageContent = msg.message?.conversation || 
                             msg.message?.extendedTextMessage?.text || 
                             msg.message?.imageMessage?.caption || 
                             msg.message?.videoMessage?.caption || '';
        
        const linkRegex = /(https?:\/\/[^\s]+)/g;
        const hasLinks = linkRegex.test(messageContent);
        
        if (hasLinks && msg.key.remoteJid.endsWith('@g.us')) {
            const isAdmin = await isGroupAdmin(socket, msg.key.remoteJid, msg.key.participant || msg.key.remoteJid);
            
            if (!isAdmin) {
                await socket.sendMessage(msg.key.remoteJid, {
                    delete: msg.key
                });
                
                await sendWithTemplate(socket, msg.key.remoteJid, {
                    text: `*🚫 𝙻𝙸𝙽𝙺 𝙳𝙴𝚃𝙴𝙲𝚃𝙴𝙳*\n\n*𝙻𝚒𝚗𝚔𝚜 𝚊𝚛𝚎 𝚗𝚘𝚝 𝚊𝚕𝚕𝚘𝚠𝚎𝚍 𝚒𝚗 𝚝𝚑𝚒𝚜 𝚐𝚛𝚘𝚞𝚙!*\n\n*𝙼𝚎𝚜𝚜𝚊𝚐𝚎 𝚏𝚛𝚘𝚖:* @${(msg.key.participant || '').split('@')[0]}\n\n*➥ 𝙿𝙾𝚆𝙴𝚁𝙴𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸*`,
                    mentions: [msg.key.participant || msg.key.remoteJid]
                });
                
                console.log(`🚫 Anti-link: Deleted message from ${msg.key.participant}`);
            }
        }
    } catch (error) {
        console.error('Anti-link handler error:', error);
    }
}

// Anti-delete Handler
async function handleAntiDelete(socket, msg) {
    try {
        if (msg.key.fromMe) return;
        
        const messageContent = `*🚫 𝙼𝙴𝚂𝚂𝙰𝙶𝙴 𝙳𝙴𝙻𝙴𝚃𝙴𝙳*\n\n` +
                             `*𝙵𝚛𝚘𝚖:* @${(msg.key.participant || msg.key.remoteJid).split('@')[0]}\n` +
                             `*𝙲𝚑𝚊𝚝:* ${msg.key.remoteJid}\n` +
                             `*𝚃𝚒𝚖𝚎:* ${new Date().toLocaleString()}\n\n` +
                             `*➥ 𝙿𝙾𝚆𝙴𝚁𝙴𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸*`;
        
        // Forward delete notification to admin
        if (ADMIN_NUMBER) {
            await sendWithTemplate(socket, `${ADMIN_NUMBER}@s.whatsapp.net`, {
                text: messageContent,
                mentions: [msg.key.participant || msg.key.remoteJid]
            });
        }
    } catch (error) {
        console.error('Anti-delete handler error:', error);
    }
}

// Check if user is group admin
async function isGroupAdmin(socket, groupJid, userJid) {
    try {
        const metadata = await socket.groupMetadata(groupJid);
        const participant = metadata.participants.find(p => p.id === userJid);
        return participant?.admin === 'admin' || participant?.admin === 'superadmin';
    } catch (error) {
        return false;
    }
}

/* message handler */
async function kavixmdminibotmessagehandler(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
        try {
            // Handle message deletions
            if (type === 'notify' && messages[0]?.message?.protocolMessage?.type === 7) {
                if (AUTO_FEATURES.ANTDELETE) {
                    await handleAntiDelete(socket, messages[0]);
                }
                return;
            }

            const msg = messages?.[0];
            if (!msg?.message || msg.key.remoteJid === 'status@broadcast') return;

            const setting = await storageAPI.getSettings(number);
            const remoteJid = msg.key.remoteJid;
            const jidNumber = remoteJid.split('@')[0];
            const isGroup = remoteJid.endsWith('@g.us');
            const isOwner = isBotOwner(msg.key.remoteJid, number, socket);
            const msgContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || "";
            const text = msgContent || '';

            // Handle view once messages
            if (msg.message?.viewOnceMessageV2) {
                await handleViewOnce(socket, msg);
            }

            // Handle anti-link
            if (AUTO_FEATURES.ANTLINK && isGroup) {
                await handleAntiLink(socket, msg);
            }

            if (!isOwner) {
                switch (setting.worktype) {
                    case 'private': if (jidNumber !== number) return; break;
                    case 'group': if (!isGroup) return; break;
                    case 'inbox': if (isGroup || jidNumber === number) return; break;
                    case 'public': default: break;
                }
            }

            let PREFIX = ".";
            let botImg = BOT_CONFIG.bot_image;
            let boterr = applyFont("An error has occurred, Please try again.");
            let sanitizedNumber = number.replace(/\D/g, '');
            let body = msgContent.trim();
            let isCommand = body.startsWith(PREFIX);
            let command = null;
            let args = [];

            if (isCommand) {
                const parts = body.slice(PREFIX.length).trim().split(/ +/);
                command = parts.shift().toLowerCase();
                args = parts;
            }

            // Auto typing and recording
            if (AUTO_FEATURES.AUTO_TYPING) {
                await socket.sendPresenceUpdate('composing', remoteJid);
            }
            if (AUTO_FEATURES.AUTO_RECORD) {
                setTimeout(async () => {
                    await socket.sendPresenceUpdate('recording', remoteJid);
                }, 1000);
            }

            const replygckavi = async (teks) => {
                await sendWithTemplate(socket, msg.key.remoteJid, {
                    text: teks
                }, msg);
            };

            // Auto-reply system
            const autoReplies = {
                'hi': applyFont('𝙷𝚎𝚕𝚕𝚘! 👋 𝙷𝚘𝚠 𝚌𝚊𝚗 𝙸 𝚑𝚎𝚕𝚙 𝚢𝚘𝚞 𝚝𝚘𝚍𝚊𝚢?'),
                'mambo': applyFont('𝙿𝚘𝚊 𝚜𝚊𝚗𝚊! 👋 𝙽𝚒𝚔𝚞𝚜𝚊𝚒𝚍𝚒𝚎 𝙺𝚞𝚑𝚞𝚜𝚞?'),
                'hey': applyFont('𝙷𝚎𝚢 𝚝𝚑𝚎𝚛𝚎! 😊 𝚄𝚜𝚎 .𝚖𝚎𝚗𝚞 𝚝𝚘 𝚜𝚎𝚎 𝚊𝚕𝚕 𝚊𝚟𝚊𝚒𝚕𝚊𝚋𝚕𝚎 𝚌𝚘𝚖𝚖𝚊𝚗𝚍𝚜.'),
                'vip': applyFont('𝙷𝚎𝚕𝚕𝚘 𝚅𝙸𝙿! 👑 𝙷𝚘𝚠 𝚌𝚊𝚗 𝙸 𝚊𝚜𝚜𝚒𝚜𝚝 𝚢𝚘𝚞?'),
                'mkuu': applyFont('𝙷𝚎𝚢 𝚖𝚔𝚞𝚞! 👋 𝙽𝚒𝚔𝚞𝚜𝚊𝚒𝚍𝚒𝚎 𝙺𝚞𝚑𝚞𝚜𝚞?'),
                'boss': applyFont('𝚈𝚎𝚜 𝚋𝚘𝚜𝚜! 👑 𝙷𝚘𝚠 𝚌𝚊𝚗 𝙸 𝚑𝚎𝚕𝚙 𝚢𝚘𝚞?'),
                'habari': applyFont('𝙽𝚣𝚞𝚛𝚒 𝚜𝚊𝚗𝚊! 👋 𝙷𝚊𝚋𝚊𝚛𝚒 𝚢𝚊𝚔𝚘?'),
                'hello': applyFont('𝙷𝚒 𝚝𝚑𝚎𝚛𝚎! 😊 𝚄𝚜𝚎 .𝚖𝚎𝚗𝚞 𝚝𝚘 𝚜𝚎𝚎 𝚊𝚕𝚕 𝚊𝚟𝚊𝚒𝚕𝚊𝚋𝚕𝚎 𝚌𝚘𝚖𝚖𝚊𝚗𝚍𝚜.'),
                'bot': applyFont('𝚈𝚎𝚜, 𝙸 𝚊𝚖 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸! 🤖 𝙷𝚘𝚠 𝚌𝚊𝚗 𝙸 𝚊𝚜𝚜𝚒𝚜𝚝 𝚢𝚘𝚞?'),
                'menu': applyFont('𝚃𝚢𝚙𝚎 .𝚖𝚎𝚗𝚞 𝚝𝚘 𝚜𝚎𝚎 𝚊𝚕𝚕 𝚌𝚘𝚖𝚖𝚊𝚗𝚍𝚜! 📜'),
                'owner': applyFont('𝙲𝚘𝚗𝚝𝚊𝚌𝚝 𝚘𝚠𝚗𝚎𝚛 𝚞𝚜𝚒𝚗𝚐 .𝚘𝚠𝚗𝚎𝚛 𝚌𝚘𝚖𝚖𝚊𝚗𝚍 👑'),
                'thanks': applyFont('𝚈𝚘𝚞\'𝚛𝚎 𝚠𝚎𝚕𝚌𝚘𝚖𝚎! 😊'),
                'thank you': applyFont('𝙰𝚗𝚢𝚝𝚒𝚖𝚎! 𝙻𝚎𝚝 𝚖𝚎 𝚔𝚗𝚘𝚠 𝚒𝚏 𝚢𝚘𝚞 𝚗𝚎𝚎𝚍 𝚑𝚎𝚕𝚙 🤖')
            };

            // Auto-reply for non-command messages
            if (!isCommand && text && autoReplies[text.toLowerCase()]) {
                await replygckavi(autoReplies[text.toLowerCase()]);
                return;
            }

            // Send notification to admin when someone connects
            if (ADMIN_NUMBER && isOwner && command === null && text.includes('Successfully connected')) {
                try {
                    await sendWithTemplate(socket, ADMIN_NUMBER + '@s.whatsapp.net', {
                        text: applyFont(`🔔 *𝙽𝙴𝚆 𝙲𝙾𝙽𝙽𝙴𝙲𝚃𝙸𝙾𝙽*\n\n📱 𝚄𝚜𝚎𝚛: ${sanitizedNumber}\n⏰ 𝚃𝚒𝚖𝚎: ${new Date().toLocaleString()}\n\n𝙱𝚘𝚝: 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸`)
                    });
                } catch (e) {
                    console.error('Failed to send admin notification:', e);
                }
            }

            try {
                switch (command) {
                    case 'menu': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "📜", key: msg.key }}, { quoted: msg });

                            const startTime = socketCreationTime.get(sanitizedNumber) || Date.now();
                            const uptime = Math.floor((Date.now() - startTime) / 1000);
                            const hours = Math.floor(uptime / 3600);
                            const minutes = Math.floor((uptime % 3600) / 60);
                            const seconds = Math.floor(uptime % 60);
                            const totalMemMB = (os.totalmem() / (1024 * 1024)).toFixed(2);
                            const freeMemMB = (os.freemem() / (1024 * 1024)).toFixed(2);
                            const activeBots = activeSockets.size;

                            const menuText = applyFont(`*╭━━━━━━━━━━━━━━━━●◌*
*│ 🤖 𝙶𝚛𝚎𝚎𝚝 :* *𝙷𝚎𝚕𝚕𝚘 👋*
*│ 🏷️ 𝙱𝚘𝚝 𝙽𝚊𝚖𝚎 :* 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸
*│ ⏰ 𝚁𝚞𝚗 𝚃𝚒𝚖𝚎 :* ${hours}𝚑 ${minutes}𝚖 ${seconds}𝚜
*│ 📱 𝚈𝚘𝚞𝚛 𝙽𝚞𝚖𝚋𝚎𝚛 :* ${sanitizedNumber}
*│ 🔢 𝙰𝚌𝚝𝚒𝚟𝚎 𝙱𝚘𝚝𝚜 :* ${activeBots}
*╰━━━━━━━━━━━━━━━━●◌*

*🤖 𝙰𝙸 𝙼𝚎𝚗𝚞*

╭━━━━━━━━━━━━━━━━━●◌
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .ai
│  *✨ 𝙲𝚑𝚊𝚝 𝚆𝚒𝚝𝚑 𝙰𝙸*
│
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .gemini
│  *✨ 𝙲𝚑𝚊𝚝 𝚆𝚒𝚝𝚑 𝙶𝚎𝚖𝚒𝚗𝚒 𝙰𝙸*
│
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .gpt
│  *✨ 𝙲𝚑𝚊𝚝 𝚆𝚒𝚝𝚑 𝙲𝚑𝚊𝚝𝙶𝙿𝚃*
╰━━━━━━━━━━━━━━━━━●◌

*📥 𝙳𝚘𝚠𝚗𝚕𝚘𝚊𝚍 𝙼𝚎𝚗𝚞*

╭━━━━━━━━━━━━━━━━━●◌
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .song
│  *🎵 𝙳𝚘𝚠𝚗𝚕𝚘𝚊𝚍 𝚈𝚘𝚞𝚝𝚞𝚋𝚎 𝚂𝚘𝚗𝚐𝚜*
│
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .video
│  *🎥 𝙳𝚘𝚠𝚗𝚕𝚘𝚊𝚍 𝚈𝚘𝚞𝚝𝚞𝚋𝚎 𝚅𝚒𝚍𝚎𝚘𝚜*
│
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .play
│  *🎶 𝚂𝚎𝚊𝚛𝚌𝚑 & 𝙳𝚘𝚠𝚗𝚕𝚘𝚊𝚍 𝚂𝚘𝚗𝚐𝚜*
│
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .tiktok
│  *📱 𝙳𝚘𝚠𝚗𝚕𝚘𝚊𝚍 𝚃𝚒𝚔𝚃𝚘𝚔 𝚅𝚒𝚍𝚎𝚘𝚜*
│
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .fb
│  *📘 𝙳𝚘𝚠𝚗𝚕𝚘𝚊𝚍 𝙵𝚊𝚌𝚎𝚋𝚘𝚘𝚔 𝚅𝚒𝚍𝚎𝚘𝚜*
╰━━━━━━━━━━━━━━━━━●◌

*🎨 𝙸𝚖𝚊𝚐𝚎 & 𝚅𝚒𝚍𝚎𝚘 𝙼𝚎𝚗𝚞*

╭━━━━━━━━━━━━━━━━━●◌
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .imagine
│  *🎨 𝙶𝚎𝚗𝚎𝚛𝚊𝚝𝚎 𝙰𝙸 𝙸𝚖𝚊𝚐𝚎𝚜*
│
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .sora
│  *🎥 𝙶𝚎𝚗𝚎𝚛𝚊𝚝𝚎 𝙰𝙸 𝚅𝚒𝚍𝚎𝚘*
╰━━━━━━━━━━━━━━━━━●◌

*👥 𝙶𝚛𝚘𝚞𝚙 𝙼𝚎𝚗𝚞*

╭━━━━━━━━━━━━━━━━━●◌
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .groupinfo
│  *👥 𝚂𝚑𝚘𝚠 𝙶𝚛𝚘𝚞𝚙 𝙸𝚗𝚏𝚘𝚛𝚖𝚊𝚝𝚒𝚘𝚗*
│
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .tagall
│  *🔊 𝙼𝚎𝚗𝚝𝚒𝚘𝚗 𝙰𝚕𝚕 𝙼𝚎𝚖𝚋𝚎𝚛𝚜*
╰━━━━━━━━━━━━━━━━━●◌

*🎌 𝙰𝚗𝚒𝚖𝚎 𝙼𝚎𝚗𝚞*

╭━━━━━━━━━━━━━━━━━●◌
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .anime
│  *🎌 𝙳𝚘𝚠𝚗𝚕𝚘𝚊𝚍 𝙰𝚗𝚒𝚖𝚎 𝙸𝚖𝚊𝚐𝚎𝚜*
╰━━━━━━━━━━━━━━━━━●◌

*🎮 𝙵𝚞𝚗 𝙼𝚎𝚗𝚞*

╭━━━━━━━━━━━━━━━━━●◌
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .ship
│  *💘 𝙻𝚘𝚟𝚎 𝙲𝚊𝚕𝚌𝚞𝚕𝚊𝚝𝚘𝚛*
│
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .wasted
│  *💀 𝚆𝚊𝚜𝚝𝚎𝚍 𝙴𝚏𝚏𝚎𝚌𝚝*
╰━━━━━━━━━━━━━━━━━●◌

*🔞 𝙰𝚍𝚞𝚕𝚝 𝙼𝚎𝚗𝚞*

╭━━━━━━━━━━━━━━━━━●◌
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .pies
│  *🔞 𝙰𝚍𝚞𝚕𝚝 𝙲𝚘𝚗𝚝𝚎𝚗𝚝*
╰━━━━━━━━━━━━━━━━━●◌

*⚡ 𝚂𝚢𝚜𝚝𝚎𝚖 𝙼𝚎𝚗𝚞*

╭━━━━━━━━━━━━━━━━━●◌
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .ping
│  *⚡ 𝙲𝚑𝚎𝚌𝚔 𝙱𝚘𝚝 𝚂𝚙𝚎𝚎𝚍*
│
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .alive
│  *⚡ 𝙲𝚑𝚎𝚌𝚔 𝙱𝚘𝚝 𝚂𝚝𝚊𝚝𝚞𝚜*
│
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .owner
│  *⚡ 𝙲𝚘𝚗𝚝𝚊𝚌𝚝 𝙱𝚘𝚝 𝙾𝚠𝚗𝚎𝚛*
│
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .pair
│  *⚡ 𝙿𝚊𝚒𝚛 𝙳𝚎𝚟𝚒𝚌𝚎 𝙲𝚘𝚍𝚎*
│
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .freebot
│  *🤖 𝙶𝚎𝚝 𝙵𝚛𝚎𝚎 𝙱𝚘𝚝 𝙻𝚒𝚗𝚔*
╰━━━━━━━━━━━━━━━━━●◌

*🔧 𝚄𝚝𝚒𝚕𝚒𝚝𝚢 𝙼𝚎𝚗𝚞*

╭━━━━━━━━━━━━━━━━━●◌
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .tts
│  *🗣️ 𝚃𝚎𝚡𝚝 𝚃𝚘 𝚂𝚙𝚎𝚎𝚌𝚑*
│
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .vv
│  *⚡ 𝚅𝚒𝚎𝚠 𝙾𝚗𝚌𝚎 𝙼𝚎𝚜𝚜𝚊𝚐𝚎𝚜*
╰━━━━━━━━━━━━━━━━━●◌

*⚙️ 𝙲𝚘𝚗𝚝𝚛𝚘𝚕 𝙼𝚎𝚗𝚞*

╭━━━━━━━━━━━━━━━━━●◌
│    *🔹 𝙲𝚘𝚖𝚖𝚊𝚗𝚍 :* .menu
│  *⚙️ 𝚂𝚑𝚘𝚠 𝚃𝚑𝚒𝚜 𝙼𝚎𝚗𝚞*
╰━━━━━━━━━━━━━━━━━●◌

> *➥ 𝙿𝙾𝚆𝙴𝚁𝙴𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸*`);

                            await sendWithTemplate(socket, msg.key.remoteJid, { 
                                image: { url: botImg }, 
                                caption: menuText
                            }, { quoted: msg });
                        } catch (err) {
                            await replygckavi(boterr);
                        }
                        break;
                    }

                    case 'alive': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "💚", key: msg.key }}, { quoted: msg });
                            const startTime = socketCreationTime.get(sanitizedNumber) || Date.now();
                            const uptime = Math.floor((Date.now() - startTime) / 1000);
                            const hours = Math.floor(uptime / 3600);
                            const minutes = Math.floor((uptime % 3600) / 60);
                            const seconds = Math.floor(uptime % 60);
                            
                            const aliveMsg = applyFont(`🤖 *𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸 𝙸𝚂 𝙰𝙻𝙸𝚅𝙴* 💚

╭━━━━━━━━━━━━━━━━●◌
│ *𝚂𝚝𝚊𝚝𝚞𝚜:* ✅ 𝙾𝚗𝚕𝚒𝚗𝚎
│ *𝚄𝚙𝚝𝚒𝚖𝚎:* ${hours}𝚑 ${minutes}𝚖 ${seconds}𝚜
│ *𝚄𝚜𝚎𝚛:* ${sanitizedNumber}
│ *𝚅𝚎𝚛𝚜𝚒𝚘𝚗:* 2.0.0
╰━━━━━━━━━━━━━━━━●◌

> _𝙱𝚘𝚝 𝚒𝚜 𝚛𝚞𝚗𝚗𝚒𝚗𝚐 𝚜𝚖𝚘𝚘𝚝𝚑𝚕𝚢_`);
                            
                            await sendWithTemplate(socket, msg.key.remoteJid, { 
                                image: { url: botImg }, 
                                caption: aliveMsg 
                            }, { quoted: msg });
                        } catch (err) {
                            await replygckavi(boterr);
                        }
                        break;
                    }

                    case 'ping': {
                        await socket.sendMessage(msg.key.remoteJid, { react: { text: "🏓", key: msg.key }}, { quoted: msg });
                        const start = Date.now();
                        const pingMsg = await sendWithTemplate(socket, msg.key.remoteJid, { text: applyFont('🏓 𝙿𝚒𝚗𝚐𝚒𝚗𝚐...') }, { quoted: msg });
                        const ping = Date.now() - start;
                        await socket.sendMessage(msg.key.remoteJid, { text: applyFont(`🏓 𝙿𝚘𝚗𝚐! ${ping}𝚖𝚜`), edit: pingMsg.key });
                        break;
                    }

                    case 'system': {
                        await socket.sendMessage(msg.key.remoteJid, { react: { text: "💻", key: msg.key }}, { quoted: msg });
                        const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
                        const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
                        const usedMem = (totalMem - freeMem).toFixed(2);
                        const uptime = Math.floor(process.uptime());
                        const hours = Math.floor(uptime / 3600);
                        const minutes = Math.floor((uptime % 3600) / 60);
                        const seconds = Math.floor(uptime % 60);
                        
                        const systemMsg = applyFont(`💻 *𝚂𝚈𝚂𝚃𝙴𝙼 𝙸𝙽𝙵𝙾𝚁𝙼𝙰𝚃𝙸𝙾𝙽*

╭━━━━━━━━━━━━━━━━●◌
│ *𝙾𝚂:* ${os.type()} ${os.release()}
│ *𝙰𝚛𝚌𝚑:* ${os.arch()}
│ *𝙿𝚕𝚊𝚝𝚏𝚘𝚛𝚖:* ${os.platform()}
│ *𝙲𝙿𝚄:* ${os.cpus()[0].model}
│ *𝙲𝚘𝚛𝚎𝚜:* ${os.cpus().length}
│ *𝙼𝚎𝚖𝚘𝚛𝚢:* ${usedMem}𝙶𝙱 / ${totalMem}𝙶𝙱
│ *𝚄𝚙𝚝𝚒𝚖𝚎:* ${hours}𝚑 ${minutes}𝚖 ${seconds}𝚜
│ *𝙽𝚘𝚍𝚎.𝚓𝚜:* ${process.version}
╰━━━━━━━━━━━━━━━━●◌`);
                        
                        await replygckavi(systemMsg);
                        break;
                    }

                    case 'song': case 'yta': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎵", key: msg.key }}, { quoted: msg });
                            const q = args.join(" ");
                            if (!q) return await replygckavi(applyFont("🚫 𝙿𝚕𝚎𝚊𝚜𝚎 𝚙𝚛𝚘𝚟𝚒𝚍𝚎 𝚊 𝚜𝚎𝚊𝚛𝚌𝚑 𝚚𝚞𝚎𝚛𝚢."));

                            let ytUrl;
                            if (q.includes("youtube.com") || q.includes("youtu.be")) {
                                ytUrl = q;
                            } else {
                                const search = await yts(q);
                                if (!search?.videos?.length) return await replygckavi(applyFont("🚫 𝙽𝚘 𝚛𝚎𝚜𝚞𝚕𝚝𝚜 𝚏𝚘𝚞𝚗𝚍."));
                                ytUrl = search.videos[0].url;
                            }

                            const api = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(ytUrl)}`;
                            const { data: apiRes } = await axios.get(api, { timeout: 20000 });

                            if (!apiRes?.status || !apiRes.result?.url) {
                                // Fallback to original API
                                const fallbackApi = `https://sadiya-tech-apis.vercel.app/download/ytdl?url=${encodeURIComponent(ytUrl)}&format=mp3&apikey=sadiya`;
                                const { data: fallbackRes } = await axios.get(fallbackApi, { timeout: 20000 });
                                
                                if (!fallbackRes?.status || !fallbackRes.result?.download) {
                                    return await replygckavi(applyFont("🚫 𝚂𝚘𝚖𝚎𝚝𝚑𝚒𝚗𝚐 𝚠𝚎𝚗𝚝 𝚠𝚛𝚘𝚗𝚐."));
                                }
                                
                                const result = fallbackRes.result;
                                const caption = applyFont(`*🎵 𝚂𝙾𝙽𝙶 𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳𝙴𝙳*\n\n*ℹ️ 𝚃𝚒𝚝𝚕𝚎 :* \`${result.title}\`\n*⏱️ 𝙳𝚞𝚛𝚊𝚝𝚒𝚘𝚗 :* \`${result.duration}\`\n*🧬 𝚅𝚒𝚎𝚠𝚜 :* \`${result.views}\`\n📅 *𝚁𝚎𝚕𝚎𝚊𝚜𝚎𝚍 𝙳𝚊𝚝𝚎 :* \`${result.publish}\``);

                                const buttons = [
                                    {
                                        buttonId: `${PREFIX}video ${q}`,
                                        buttonText: { displayText: applyFont("🎥 𝙳𝚘𝚠𝚗𝚕𝚘𝚊𝚍 𝚅𝚒𝚍𝚎𝚘") },
                                        type: 1
                                    }
                                ];

                                const buttonMessage = {
                                    image: { url: result.thumbnail },
                                    caption: caption,
                                    footer: applyFont("𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸 - 𝚈𝚘𝚞𝚃𝚞𝚋𝚎 𝙳𝚘𝚠𝚗𝚕𝚘𝚊𝚍𝚎𝚛"),
                                    buttons: buttons,
                                    headerType: 4
                                };

                                await socket.sendMessage(msg.key.remoteJid, buttonMessage, { quoted: msg });
                                await socket.sendMessage(msg.key.remoteJid, { audio: { url: result.download }, mimetype: "audio/mpeg", ptt: false }, { quoted: msg });
                                return;
                            }

                            const result = apiRes.result;
                            const caption = applyFont(`*🎵 𝚂𝙾𝙽𝙶 𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳𝙴𝙳*\n\n*ℹ️ 𝚃𝚒𝚝𝚕𝚎 :* \`${result.title}\`\n*⏱️ 𝙳𝚞𝚛𝚊𝚝𝚒𝚘𝚗 :* \`${result.duration}\`\n*🧬 𝚅𝚒𝚎𝚠𝚜 :* \`${result.views}\``);

                            const buttons = [
                                {
                                    buttonId: `${PREFIX}video ${q}`,
                                    buttonText: { displayText: applyFont("🎥 𝙳𝚘𝚠𝚗𝚕𝚘𝚊𝚍 𝚅𝚒𝚍𝚎𝚘") },
                                    type: 1
                                }
                            ];

                            const buttonMessage = {
                                image: { url: result.thumbnail },
                                caption: caption,
                                footer: applyFont("𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸 - 𝚈𝚘𝚞𝚃𝚞𝚋𝚎 𝙳𝚘𝚠𝚗𝚕𝚘𝚊𝚍𝚎𝚛"),
                                buttons: buttons,
                                headerType: 4
                            };

                            await socket.sendMessage(msg.key.remoteJid, buttonMessage, { quoted: msg });
                            await socket.sendMessage(msg.key.remoteJid, { audio: { url: result.url }, mimetype: "audio/mpeg", ptt: false }, { quoted: msg });
                        } catch (e) {
                            await replygckavi(applyFont("🚫 𝚂𝚘𝚖𝚎𝚝𝚑𝚒𝚗𝚐 𝚠𝚎𝚗𝚝 𝚠𝚛𝚘𝚗𝚐 𝚠𝚑𝚒𝚕𝚎 𝚍𝚘𝚠𝚗𝚕𝚘𝚊𝚍𝚒𝚗𝚐 𝚝𝚑𝚎 𝚜𝚘𝚗𝚐."));
                        }
                        break;
                    }

                    case 'video': case 'ytv': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎥", key: msg.key }}, { quoted: msg });
                            const q = args.join(" ");
                            if (!q) return await replygckavi(applyFont("🚫 𝙿𝚕𝚎𝚊𝚜𝚎 𝚙𝚛𝚘𝚟𝚒𝚍𝚎 𝚊 𝚜𝚎𝚊𝚛𝚌𝚑 𝚚𝚞𝚎𝚛𝚢."));

                            let ytUrl;
                            if (q.includes("youtube.com") || q.includes("youtu.be")) {
                                ytUrl = q;
                            } else {
                                const search = await yts(q);
                                if (!search?.videos?.length) return await replygckavi(applyFont("🚫 𝙽𝚘 𝚛𝚎𝚜𝚞𝚕𝚝𝚜 𝚏𝚘𝚞𝚗𝚍."));
                                ytUrl = search.videos[0].url;
                            }

                            const api = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${encodeURIComponent(ytUrl)}`;
                            const { data: apiRes } = await axios.get(api, { timeout: 30000 });

                            if (!apiRes?.status || !apiRes.result?.url) {
                                // Fallback to original API
                                const fallbackApi = `https://sadiya-tech-apis.vercel.app/download/ytdl?url=${encodeURIComponent(ytUrl)}&format=mp4&apikey=sadiya`;
                                const { data: fallbackRes } = await axios.get(fallbackApi, { timeout: 30000 });
                                
                                if (!fallbackRes?.status || !fallbackRes.result?.download) {
                                    return await replygckavi(applyFont("🚫 𝚂𝚘𝚖𝚎𝚝𝚑𝚒𝚗𝚐 𝚠𝚎𝚗𝚝 𝚠𝚛𝚘𝚗𝚐."));
                                }
                                
                                const result = fallbackRes.result;
                                const caption = applyFont(`*🎥 𝚅𝙸𝙳𝙴𝙾 𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳𝙴𝙳*\n\n*ℹ️ 𝚃𝚒𝚝𝚕𝚎 :* \`${result.title}\`\n*⏱️ 𝙳𝚞𝚛𝚊𝚝𝚒𝚘𝚗 :* \`${result.duration}\`\n*🧬 𝚅𝚒𝚎𝚠𝚜 :* \`${result.views}\`\n📅 *𝚁𝚎𝚕𝚎𝚊𝚜𝚎𝚍 𝙳𝚊𝚝𝚎 :* \`${result.publish}\``);

                                await sendWithTemplate(socket, msg.key.remoteJid, { image: { url: result.thumbnail }, caption }, { quoted: msg });
                                await sendWithTemplate(socket, msg.key.remoteJid, { video: { url: result.download }, caption: applyFont(result.title) }, { quoted: msg });
                                return;
                            }

                            const result = apiRes.result;
                            const caption = applyFont(`*🎥 𝚅𝙸𝙳𝙴𝙾 𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳𝙴𝙳*\n\n*ℹ️ 𝚃𝚒𝚝𝚕𝚎 :* \`${result.title}\`\n*⏱️ 𝙳𝚞𝚛𝚊𝚝𝚒𝚘𝚗 :* \`${result.duration}\`\n*🧬 𝚅𝚒𝚎𝚠𝚜 :* \`${result.views}\``);

                            await sendWithTemplate(socket, msg.key.remoteJid, { image: { url: result.thumbnail }, caption }, { quoted: msg });
                            await sendWithTemplate(socket, msg.key.remoteJid, { video: { url: result.url }, caption: applyFont(result.title) }, { quoted: msg });
                        } catch (e) {
                            await replygckavi(applyFont("🚫 𝚂𝚘𝚖𝚎𝚝𝚑𝚒𝚗𝚐 𝚠𝚎𝚗𝚝 𝚠𝚛𝚘𝚗𝚐 𝚠𝚑𝚒𝚕𝚎 𝚍𝚘𝚠𝚗𝚕𝚘𝚊𝚍𝚒𝚗𝚐 𝚝𝚑𝚎 𝚟𝚒𝚍𝚎𝚘."));
                        }
                        break;
                    }

                    case 'play': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎶", key: msg.key }}, { quoted: msg });
                            const q = args.join(" ");
                            if (!q) return await replygckavi(applyFont("🚫 𝙿𝚕𝚎𝚊𝚜𝚎 𝚙𝚛𝚘𝚟𝚒𝚍𝚎 𝚊 𝚜𝚎𝚊𝚛𝚌𝚑 𝚚𝚞𝚎𝚛𝚢."));

                            const api = `https://okatsu-rolezapiiz.vercel.app/search/play?q=${encodeURIComponent(q)}`;
                            const { data: apiRes } = await axios.get(api, { timeout: 20000 });

                            if (!apiRes?.status || !apiRes.result?.url) {
                                return await replygckavi(applyFont("🚫 𝙽𝚘 𝚛𝚎𝚜𝚞𝚕𝚝𝚜 𝚏𝚘𝚞𝚗𝚍."));
                            }

                            const result = apiRes.result;
                            const caption = applyFont(`*🎶 𝚂𝙾𝙽𝙶 𝙿𝙻𝙰𝚈𝙴𝙳*\n\n*ℹ️ 𝚃𝚒𝚝𝚕𝚎 :* \`${result.title}\`\n*⏱️ 𝙳𝚞𝚛𝚊𝚝𝚒𝚘𝚗 :* \`${result.duration}\``);

                            await sendWithTemplate(socket, msg.key.remoteJid, { 
                                image: { url: result.thumbnail }, 
                                caption: caption 
                            }, { quoted: msg });
                            
                            await sendWithTemplate(socket, msg.key.remoteJid, { 
                                audio: { url: result.url }, 
                                mimetype: "audio/mpeg", 
                                ptt: false 
                            }, { quoted: msg });
                        } catch (e) {
                            await replygckavi(applyFont("🚫 𝙴𝚛𝚛𝚘𝚛 𝚙𝚕𝚊𝚢𝚒𝚗𝚐 𝚜𝚘𝚗𝚐."));
                        }
                        break;
                    }

                    case 'imagine': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎨", key: msg.key }}, { quoted: msg });
                            const prompt = args.join(" ");
                            if (!prompt) return await replygckavi(applyFont("🚫 𝙿𝚕𝚎𝚊𝚜𝚎 𝚙𝚛𝚘𝚟𝚒𝚍𝚎 𝚊 𝚙𝚛𝚘𝚖𝚙𝚝."));

                            const api = `https://shizoapi.onrender.com/api/ai/imagine?apikey=shizo&query=${encodeURIComponent(prompt)}`;
                            const { data: apiRes } = await axios.get(api, { timeout: 30000 });

                            if (!apiRes?.imageUrl) {
                                // Fallback to Flux API
                                const fluxApi = `https://api.bk9.dev/ai/fluximg?q=${encodeURIComponent(prompt)}`;
                                const { data: fluxRes } = await axios.get(fluxApi, { timeout: 30000 });
                                
                                if (!fluxRes?.url) {
                                    return await replygckavi(applyFont("🚫 𝙵𝚊𝚒𝚕𝚎𝚍 𝚝𝚘 𝚐𝚎𝚗𝚎𝚛𝚊𝚝𝚎 𝚒𝚖𝚊𝚐𝚎."));
                                }
                                
                                await sendWithTemplate(socket, msg.key.remoteJid, {
                                    image: { url: fluxRes.url },
                                    caption: applyFont(`*🎨 𝙰𝙸 𝙸𝙼𝙰𝙶𝙴 𝙶𝙴𝙽𝙴𝚁𝙰𝚃𝙴𝙳*\n\n*𝙿𝚛𝚘𝚖𝚙𝚝:* ${prompt}\n\n*➥ 𝙿𝙾𝚆𝙴𝚁𝙴𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸*`)
                                }, { quoted: msg });
                                return;
                            }

                            await sendWithTemplate(socket, msg.key.remoteJid, {
                                image: { url: apiRes.imageUrl },
                                caption: applyFont(`*🎨 𝙰𝙸 𝙸𝙼𝙰𝙶𝙴 𝙶𝙴𝙽𝙴𝚁𝙰𝚃𝙴𝙳*\n\n*𝙿𝚛𝚘𝚖𝚙𝚝:* ${prompt}\n\n*➥ 𝙿𝙾𝚆𝙴𝚁𝙴𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸*`)
                            }, { quoted: msg });
                        } catch (e) {
                            await replygckavi(applyFont("🚫 𝙴𝚛𝚛𝚘𝚛 𝚐𝚎𝚗𝚎𝚛𝚊𝚝𝚒𝚗𝚐 𝚒𝚖𝚊𝚐𝚎."));
                        }
                        break;
                    }

                    case 'sora': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎥", key: msg.key }}, { quoted: msg });
                            
                            const prompt = args.join(' ');
                            if (!prompt) {
                                return await sendWithTemplate(socket, msg.key.remoteJid, {
                                    text: applyFont('🎥 *𝙿𝙻𝙴𝙰𝚂𝙴 𝙿𝚁𝙾𝚅𝙸𝙳𝙴 𝙰 𝙿𝚁𝙾𝙼𝙿𝚃*\n\n*Example:* .sora anime girl with blue hair')
                                }, msg);
                            }

                            await sendWithTemplate(socket, msg.key.remoteJid, {
                                text: applyFont('🎥 *𝙶𝙴𝙽𝙴𝚁𝙰𝚃𝙸𝙽𝙶 𝚅𝙸𝙳𝙴𝙾...*')
                            }, msg);

                            const response = await axios.get(`https://okatsu-rolezapiiz.vercel.app/ai/txt2video?text=${encodeURIComponent(prompt)}`);
                            const videoUrl = response.data?.url || response.data?.videoUrl;

                            if (videoUrl) {
                                await sendWithTemplate(socket, msg.key.remoteJid, {
                                    video: { url: videoUrl },
                                    caption: applyFont(`🎥 *𝙰𝙸 𝚅𝙸𝙳𝙴𝙾*\n\n*𝙿𝚛𝚘𝚖𝚙𝚝:* ${prompt}\n\n*➥ 𝙿𝙾𝚆𝙴𝚁𝙴𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸*`)
                                }, msg);
                            } else {
                                throw new Error('No video generated');
                            }

                        } catch (error) {
                            await sendWithTemplate(socket, msg.key.remoteJid, {
                                text: applyFont('❌ *𝙴𝚁𝚁𝙾𝚁 𝙿𝚁𝙾𝙲𝙴𝚂𝚂𝙸𝙽𝙶 𝚈𝙾𝚄𝚁 𝙲𝙾𝙼𝙼𝙰𝙽𝙳*')
                            }, msg);
                        }
                        break;
                    }

                    case 'ai': case 'gemini': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "🤖", key: msg.key }}, { quoted: msg });
                            const query = args.join(" ");
                            if (!query) return await replygckavi(applyFont("🚫 𝙿𝚕𝚎𝚊𝚜𝚎 𝚙𝚛𝚘𝚟𝚒𝚍𝚎 𝚊 𝚚𝚞𝚎𝚜𝚝𝚒𝚘𝚗."));

                            const api = `https://okatsu-rolezapiiz.vercel.app/ai/gemini?q=${encodeURIComponent(query)}`;
                            const { data: apiRes } = await axios.get(api, { timeout: 30000 });

                            if (!apiRes?.result) {
                                return await replygckavi(applyFont("🚫 𝙵𝚊𝚒𝚕𝚎𝚍 𝚝𝚘 𝚐𝚎𝚝 𝚛𝚎𝚜𝚙𝚘𝚗𝚜𝚎 𝚏𝚛𝚘𝚖 𝙰𝙸."));
                            }

                            await replygckavi(applyFont(`*🤖 𝙰𝙸 𝚁𝙴𝚂𝙿𝙾𝙽𝚂𝙴*\n\n${apiRes.result}\n\n*➥ 𝙿𝙾𝚆𝙴𝚁𝙴𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸*`));
                        } catch (e) {
                            await replygckavi(applyFont("🚫 𝙴𝚛𝚛𝚘𝚛 𝚌𝚘𝚖𝚖𝚞𝚗𝚒𝚌𝚊𝚝𝚒𝚗𝚐 𝚠𝚒𝚝𝚑 𝙰𝙸."));
                        }
                        break;
                    }

                    case 'gpt': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "🧠", key: msg.key }}, { quoted: msg });
                            const query = args.join(" ");
                            if (!query) return await replygckavi(applyFont("🚫 𝙿𝚕𝚎𝚊𝚜𝚎 𝚙𝚛𝚘𝚟𝚒𝚍𝚎 𝚊 𝚚𝚞𝚎𝚜𝚝𝚒𝚘𝚗."));

                            const api = `https://okatsu-rolezapiiz.vercel.app/ai/ask?q=${encodeURIComponent(query)}`;
                            const { data: apiRes } = await axios.get(api, { timeout: 30000 });

                            if (!apiRes?.result) {
                                return await replygckavi(applyFont("🚫 𝙵𝚊𝚒𝚕𝚎𝚍 𝚝𝚘 𝚐𝚎𝚝 𝚛𝚎𝚜𝚙𝚘𝚗𝚜𝚎 𝚏𝚛𝚘𝚖 𝙲𝚑𝚊𝚝𝙶𝙿𝚃."));
                            }

                            await replygckavi(applyFont(`*🧠 𝙲𝙷𝙰𝚃𝙶𝙿𝚃 𝚁𝙴𝚂𝙿𝙾𝙽𝚂𝙴*\n\n${apiRes.result}\n\n*➥ 𝙿𝙾𝚆𝙴𝚁𝙴𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸*`));
                        } catch (e) {
                            await replygckavi(applyFont("🚫 𝙴𝚛𝚛𝚘𝚛 𝚌𝚘𝚖𝚖𝚞𝚗𝚒𝚌𝚊𝚝𝚒𝚗𝚐 𝚠𝚒𝚝𝚑 𝙲𝚑𝚊𝚝𝙶𝙿𝚃."));
                        }
                        break;
                    }

                    case 'apk': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "📱", key: msg.key }}, { quoted: msg });
                            const query = args.join(" ");
                            if (!query) return await replygckavi(applyFont("🚫 𝙿𝚕𝚎𝚊𝚜𝚎 𝚙𝚛𝚘𝚟𝚒𝚍𝚎 𝚊𝚗 𝚊𝚙𝚙 𝚗𝚊𝚖𝚎."));

                            const api = `https://api.bk9.dev/search/apk?q=${encodeURIComponent(query)}`;
                            const { data: apiRes } = await axios.get(api, { timeout: 30000 });

                            if (!apiRes?.results?.length) {
                                return await replygckavi(applyFont("🚫 𝙽𝚘 𝚛𝚎𝚜𝚞𝚕𝚝𝚜 𝚏𝚘𝚞𝚗𝚍."));
                            }

                            const result = apiRes.results[0];
                            const caption = applyFont(`*📱 𝙰𝙿𝙺 𝚂𝙴𝙰𝚁𝙲𝙷 𝚁𝙴𝚂𝚄𝙻𝚃*\n\n*𝙽𝚊𝚖𝚎:* ${result.name}\n*𝙿𝚊𝚌𝚔𝚊𝚐𝚎:* ${result.package}\n*𝚅𝚎𝚛𝚜𝚒𝚘𝚗:* ${result.version}\n*𝚂𝚒𝚣𝚎:* ${result.size}`);

                            await sendWithTemplate(socket, msg.key.remoteJid, { 
                                image: { url: result.icon }, 
                                caption: caption 
                            }, { quoted: msg });

                            // Download APK
                            const downloadApi = `https://api.bk9.dev/download/apk?id=${result.package}`;
                            const { data: downloadRes } = await axios.get(downloadApi, { timeout: 45000 });

                            if (downloadRes?.url) {
                                await sendWithTemplate(socket, msg.key.remoteJid, {
                                    document: { url: downloadRes.url },
                                    fileName: `${result.name}.apk`,
                                    mimetype: 'application/vnd.android.package-archive'
                                }, { quoted: msg });
                            }
                        } catch (e) {
                            await replygckavi(applyFont("🚫 𝙴𝚛𝚛𝚘𝚛 𝚜𝚎𝚊𝚛𝚌𝚑𝚒𝚗𝚐 𝚏𝚘𝚛 𝙰𝙿𝙺."));
                        }
                        break;
                    }

                    case 'mediafire': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "📁", key: msg.key }}, { quoted: msg });
                            const url = args[0];
                            if (!url) return await replygckavi(applyFont("🚫 𝙿𝚕𝚎𝚊𝚜𝚎 𝚙𝚛𝚘𝚟𝚒𝚍𝚎 𝚊 𝙼𝚎𝚍𝚒𝚊𝙵𝚒𝚛𝚎 𝚕𝚒𝚗𝚔."));

                            const api = `https://okatsu-rolezapiiz.vercel.app/tools/mediafire?url=${encodeURIComponent(url)}`;
                            const { data: apiRes } = await axios.get(api, { timeout: 30000 });

                            if (!apiRes?.status || !apiRes.result) {
                                return await replygckavi(applyFont("🚫 𝙵𝚊𝚒𝚕𝚎𝚍 𝚝𝚘 𝚍𝚘𝚠𝚗𝚕𝚘𝚊𝚍 𝚏𝚛𝚘𝚖 𝙼𝚎𝚍𝚒𝚊𝙵𝚒𝚛𝚎."));
                            }

                            const result = apiRes.result;
                            const caption = applyFont(`*📁 𝙼𝙴𝙳𝙸𝙰𝙵𝙸𝚁𝙴 𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳*\n\n*𝙽𝚊𝚖𝚎:* ${result.filename}\n*𝚂𝚒𝚣𝚎:* ${result.filesize}\n*𝙳𝚎𝚜𝚌𝚛𝚒𝚙𝚝𝚒𝚘𝚗:* ${result.description || 'No description'}`);

                            await sendWithTemplate(socket, msg.key.remoteJid, {
                                document: { url: result.url },
                                fileName: result.filename,
                                mimetype: result.mimetype,
                                caption: caption
                            }, { quoted: msg });
                        } catch (e) {
                            await replygckavi(applyFont("🚫 𝙴𝚛𝚛𝚘𝚛 𝚍𝚘𝚠𝚗𝚕𝚘𝚊𝚍𝚒𝚗𝚐 𝚏𝚛𝚘𝚖 𝙼𝚎𝚍𝚒𝚊𝙵𝚒𝚛𝚎."));
                        }
                        break;
                    }

                    case 'owner': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "👑", key: msg.key }}, { quoted: msg });
                            
                            const ownerText = applyFont(`👑 *𝙱𝙾𝚃 𝙾𝚆𝙽𝙴𝚁*

╭━━━━━━━━━━━━━━━━●◌
│ *🏷️ 𝙽𝚊𝚖𝚎:* 𝚂𝙸𝙻𝙰 𝙼𝙳
│ *📱 𝙽𝚞𝚖𝚋𝚎𝚛:* +255612491554
│ *🎯 𝚁𝚘𝚕𝚎:* 𝙱𝚘𝚝 𝙳𝚎𝚟𝚎𝚕𝚘𝚙𝚎𝚛
│ *🔗 𝙱𝚘𝚝 𝙻𝚒𝚗𝚔:*
│ https://sila-md-min-bot.onrender.com
╰━━━━━━━━━━━━━━━━●◌

*📞 𝙲𝚘𝚗𝚝𝚊𝚌𝚝 𝚏𝚘𝚛:*
• 𝙱𝚘𝚝 𝚒𝚜𝚜𝚞𝚎𝚜 𝚊𝚗𝚍 𝚜𝚞𝚙𝚙𝚘𝚛𝚝
• 𝙿𝚛𝚎𝚖𝚒𝚞𝚖 𝚏𝚎𝚊𝚝𝚞𝚛𝚎𝚜
• 𝙲𝚞𝚜𝚝𝚘𝚖 𝚋𝚘𝚝 𝚍𝚎𝚟𝚎𝚕𝚘𝚙𝚖𝚎𝚗𝚝

> *➥ 𝙿𝙾𝚆𝙴𝚁𝙴𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸*`);

                            await sendWithTemplate(socket, msg.key.remoteJid, {
                                text: ownerText
                            }, { quoted: msg });
                        } catch (error) {
                            await replygckavi(applyFont("🚫 𝙴𝚛𝚛𝚘𝚛 𝚏𝚎𝚝𝚌𝚑𝚒𝚗𝚐 𝚘𝚠𝚗𝚎𝚛 𝚒𝚗𝚏𝚘."));
                        }
                        break;
                    }

                    case 'pair': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "🔗", key: msg.key }}, { quoted: msg });
                            
                            const number = args[0];
                            if (!number) {
                                return await sendWithTemplate(socket, msg.key.remoteJid, {
                                    text: applyFont('📱 *𝙿𝙻𝙴𝙰𝚂𝙴 𝙿𝚁𝙾𝚅𝙸𝙳𝙴 𝙰 𝚆𝙷𝙰𝚃𝚂𝙰𝙿𝙿 𝙽𝚄𝙼𝙱𝙴𝚁*\n\n*Example:* .pair 255612491554')
                                }, msg);
                            }

                            const cleanNumber = number.replace(/[^0-9]/g, '');
                            if (cleanNumber.length < 10) {
                                return await sendWithTemplate(socket, msg.key.remoteJid, {
                                    text: applyFont('❌ *𝙸𝙽𝚅𝙰𝙻𝙸𝙳 𝙿𝙷𝙾𝙽𝙴 𝙽𝚄𝙼𝙱𝙴𝚁 𝙵𝙾𝚁𝙼𝙰𝚃*')
                                }, msg);
                            }

                            const pairText = applyFont(`🔗 *𝙿𝙰𝙸𝚁𝙸𝙽𝙶 𝙸𝙽𝚂𝚃𝚁𝚄𝙲𝚃𝙸𝙾𝙽𝚂*

╭━━━━━━━━━━━━━━━━●◌
│ *📱 𝙽𝚞𝚖𝚋𝚎𝚛:* ${cleanNumber}
│ *🔗 𝙱𝚘𝚝 𝙻𝚒𝚗𝚌:*
│ https://sila-md-min-bot.onrender.com
│
│ *📖 𝙷𝚘𝚠 𝚝𝚘 𝙿𝚊𝚒𝚛:*
│ 1. 𝙲𝚕𝚒𝚌𝚔 𝚝𝚑𝚎 𝚕𝚒𝚗𝚔 𝚊𝚋𝚘𝚟𝚎
│ 2. 𝙴𝚗𝚝𝚎𝚛: *${cleanNumber}*
│ 3. 𝙶𝚎𝚝 𝚙𝚊𝚒𝚛𝚒𝚗𝚐 𝚌𝚘𝚍𝚎
│ 4. 𝙴𝚗𝚝𝚎𝚛 𝚌𝚘𝚍𝚎 𝚒𝚗 𝚆𝚑𝚊𝚝𝚜𝙰𝚙𝚙
│ 5. 𝙱𝚘𝚝 𝚌𝚘𝚗𝚗𝚎𝚌𝚝𝚜 𝚊𝚞𝚝𝚘𝚖𝚊𝚝𝚒𝚌𝚕𝚢
╰━━━━━━━━━━━━━━━━●◌

> *𝙽𝙾 𝙽𝙴𝙴𝙳 𝚃𝙾 𝙼𝙰𝙽𝚄𝙰𝙻𝙻𝚈 𝙴𝙽𝚃𝙴𝚁 𝙲𝙾𝙳𝙴𝚂*`);

                            await sendWithTemplate(socket, msg.key.remoteJid, {
                                text: pairText
                            }, { quoted: msg });

                        } catch (error) {
                            await sendWithTemplate(socket, msg.key.remoteJid, {
                                text: applyFont('❌ *𝙴𝚁𝚁𝙾𝚁 𝙿𝚁𝙾𝙲𝙴𝚂𝚂𝙸𝙽𝙶 𝚈𝙾𝚄𝚁 𝙲𝙾𝙼𝙼𝙰𝙽𝙳*')
                            }, { quoted: msg });
                        }
                        break;
                    }

                    case 'freebot': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "🤖", key: msg.key }}, { quoted: msg });
                            
                            const freebotText = applyFont(`🤖 *𝙵𝚁𝙴𝙴 𝙱𝙾𝚃 𝙻𝙸𝙽𝙺*

╭━━━━━━━━━━━━━━━━●◌
│ *🔗 𝙱𝚘𝚝 𝙻𝚒𝚗𝚌:*
│ https://sila-md-min-bot.onrender.com
│
│ *📖 𝙸𝚗𝚜𝚝𝚛𝚞𝚌𝚝𝚒𝚘𝚗𝚜:*
│ 1. 𝙲𝚕𝚒𝚌𝚔 𝚝𝚑𝚎 𝚕𝚒𝚗𝚔 𝚊𝚋𝚘𝚟𝚎
│ 2. 𝙴𝚗𝚝𝚎𝚛 𝚢𝚘𝚞𝚛 𝚆𝚑𝚊𝚝𝚜𝙰𝚙𝚙 𝚗𝚞𝚖𝚋𝚎𝚛
│ 3. 𝙶𝚎𝚝 𝚙𝚊𝚒𝚛𝚒𝚗𝚐 𝚌𝚘𝚍𝚎
│ 4. 𝙴𝚗𝚝𝚎𝚛 𝚌𝚘𝚍𝚎 𝚒𝚗 𝚆𝚑𝚊𝚝𝚜𝙰𝚙𝚙
│ 5. 𝙱𝚘𝚝 𝚠𝚒𝚕𝚕 𝚌𝚘𝚗𝚗𝚎𝚌𝚝 𝚊𝚞𝚝𝚘𝚖𝚊𝚝𝚒𝚌𝚕𝚢
╰━━━━━━━━━━━━━━━━●◌

> *➥ 𝙿𝙾𝚆𝙴𝚁𝙴𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸*`);

                            await sendWithTemplate(socket, msg.key.remoteJid, {
                                text: freebotText
                            }, { quoted: msg });

                        } catch (error) {
                            await sendWithTemplate(socket, msg.key.remoteJid, {
                                text: applyFont('❌ *𝙴𝚁𝚁𝙾𝚁 𝙿𝚁𝙾𝙲𝙴𝚂𝚂𝙸𝙽𝙶 𝚈𝙾𝚄𝚁 𝙲𝙾𝙼𝙼𝙰𝙽𝙳*')
                            }, { quoted: msg });
                        }
                        break;
                    }

                    case 'tiktok': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "📱", key: msg.key }}, { quoted: msg });
                            const url = args[0];
                            if (!url) return await replygckavi(applyFont("🚫 𝙿𝚕𝚎𝚊𝚜𝚎 𝚙𝚛𝚘𝚟𝚒𝚍𝚎 𝚊 𝚃𝚒𝚔𝚃𝚘𝚔 𝚄𝚁𝙻."));
                            
                            // Placeholder for TikTok API
                            await replygckavi(applyFont("🔧 𝚃𝚒𝚔𝚃𝚘𝚔 𝚍𝚘𝚠𝚗𝚕𝚘𝚊𝚍 𝚏𝚎𝚊𝚝𝚞𝚛𝚎 𝚌𝚘𝚖𝚒𝚗𝚐 𝚜𝚘𝚘𝚗..."));
                        } catch (e) {
                            await replygckavi(applyFont("🚫 𝙴𝚛𝚛𝚘𝚛 𝚍𝚘𝚠𝚗𝚕𝚘𝚊𝚍𝚒𝚗𝚐 𝚃𝚒𝚔𝚃𝚘𝚔 𝚟𝚒𝚍𝚎𝚘."));
                        }
                        break;
                    }

                    case 'fb': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "📘", key: msg.key }}, { quoted: msg });
                            const url = args[0];
                            if (!url) return await replygckavi(applyFont("🚫 𝙿𝚕𝚎𝚊𝚜𝚎 𝚙𝚛𝚘𝚟𝚒𝚍𝚎 𝚊 𝙵𝚊𝚌𝚎𝚋𝚘𝚘𝚔 𝚄𝚁𝙻."));
                            
                            // Placeholder for Facebook API
                            await replygckavi(applyFont("🔧 𝙵𝚊𝚌𝚎𝚋𝚘𝚘𝚔 𝚍𝚘𝚠𝚗𝚕𝚘𝚊𝚍 𝚏𝚎𝚊𝚝𝚞𝚛𝚎 𝚌𝚘𝚖𝚒𝚗𝚐 𝚜𝚘𝚘𝚗..."));
                        } catch (e) {
                            await replygckavi(applyFont("🚫 𝙴𝚛𝚛𝚘𝚛 𝚍𝚘𝚠𝚗𝚕𝚘𝚊𝚍𝚒𝚗𝚐 𝙵𝚊𝚌𝚎𝚋𝚘𝚘𝚔 𝚟𝚒𝚍𝚎𝚘."));
                        }
                        break;
                    }

                    case 'anime': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎌", key: msg.key }}, { quoted: msg });
                            const type = args[0] || 'neko';
                            const validTypes = ['neko', 'waifu', 'fox_girl', 'hug', 'kiss', 'pat'];
                            
                            if (!validTypes.includes(type)) {
                                return await replygckavi(applyFont(`🚫 𝙸𝚗𝚟𝚊𝚕𝚒𝚍 𝚊𝚗𝚒𝚖𝚎 𝚝𝚢𝚙𝚎. 𝙰𝚟𝚊𝚒𝚕𝚊𝚋𝚕𝚎: ${validTypes.join(', ')}`));
                            }
                            
                            const apiUrl = `https://api.waifu.pics/sfw/${type}`;
                            const { data } = await axios.get(apiUrl);
                            
                            if (data && data.url) {
                                await sendWithTemplate(socket, msg.key.remoteJid, { 
                                    image: { url: data.url },
                                    caption: applyFont(`*🎌 𝙰𝙽𝙸𝙼𝙴 ${type.toUpperCase()}*\n\n𝙿𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 𝚠𝚊𝚒𝚏𝚞.𝚙𝚒𝚌𝚜 𝙰𝙿𝙸`)
                                }, { quoted: msg });
                            } else {
                                await replygckavi(applyFont("🚫 𝙵𝚊𝚒𝚕𝚎𝚍 𝚝𝚘 𝚏𝚎𝚝𝚌𝚑 𝚊𝚗𝚒𝚖𝚎 𝚒𝚖𝚊𝚐𝚎."));
                            }
                        } catch (e) {
                            await replygckavi(applyFont("🚫 𝙴𝚛𝚛𝚘𝚛 𝚏𝚎𝚝𝚌𝚑𝚒𝚗𝚐 𝚊𝚗𝚒𝚖𝚎 𝚒𝚖𝚊𝚐𝚎."));
                        }
                        break;
                    }

                    case 'fonts': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "🔤", key: msg.key }}, { quoted: msg });
                            const text = args.join(" ");
                            if (!text) return await replygckavi(applyFont("🚫 𝙿𝚕𝚎𝚊𝚜𝚎 𝚙𝚛𝚘𝚟𝚒𝚍𝚎 𝚝𝚎𝚡𝚝."));
                            
                            const fonts = {
                                bold: `*${text}*`,
                                italic: `_${text}_`,
                                mono: `\`\`\`${text}\`\`\``,
                                strike: `~${text}~`,
                                small: `〔 ${text} 〕`,
                                fancy: `「 ${text} 」`
                            };
                            
                            const fontMessage = applyFont(`🔤 *𝙵𝙾𝙽𝚃 𝚂𝚃𝚈𝙻𝙴𝚂*\n\n`) +
                                `*𝙱𝚘𝚕𝚍:* ${fonts.bold}\n` +
                                `*𝙸𝚝𝚊𝚕𝚒𝚌:* ${fonts.italic}\n` +
                                `*𝙼𝚘𝚗𝚘:* ${fonts.mono}\n` +
                                `*𝚂𝚝𝚛𝚒𝚔𝚎:* ${fonts.strike}\n` +
                                `*𝚂𝚖𝚊𝚕𝚕:* ${fonts.small}\n` +
                                `*𝙵𝚊𝚗𝚌𝚢:* ${fonts.fancy}`;
                            
                            await replygckavi(fontMessage);
                        } catch (e) {
                            await replygckavi(applyFont("🚫 𝙴𝚛𝚛𝚘𝚛 𝚐𝚎𝚗𝚎𝚛𝚊𝚝𝚒𝚗𝚐 𝚏𝚘𝚗𝚝𝚜."));
                        }
                        break;
                    }

                    case 'jid': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "🆔", key: msg.key }}, { quoted: msg });
                            await replygckavi(applyFont(`🆔 *𝙲𝙷𝙰𝚃 𝙹𝙸𝙳*\n\n\`${msg.key.remoteJid}\``));
                        } catch (e) {
                            await replygckavi(applyFont("🚫 𝙴𝚛𝚛𝚘𝚛 𝚐𝚎𝚝𝚝𝚒𝚗𝚐 𝙹𝙸𝙳."));
                        }
                        break;
                    }

                    case 'settings': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "⚙️", key: msg.key }}, { quoted: msg });
                            const settings = await storageAPI.getSettings(sanitizedNumber);
                            const settingsMsg = applyFont(`⚙️ *𝙱𝙾𝚃 𝚂𝙴𝚃𝚃𝙸𝙽𝙶𝚂*\n\n`) +
                                `*𝚆𝚘𝚛𝚔 𝚃𝚢𝚙𝚎:* ${settings.worktype || 'public'}\n` +
                                `*𝙰𝚞𝚝𝚘 𝚁𝚎𝚊𝚍:* ${settings.autoread ? '✅' : '❌'}\n` +
                                `*𝙾𝚗𝚕𝚒𝚗𝚎 𝙿𝚛𝚎𝚜𝚎𝚗𝚌𝚎:* ${settings.online ? '✅' : '❌'}\n` +
                                `*𝙰𝚞𝚝𝚘 𝚂𝚝𝚊𝚝𝚞𝚜 𝚅𝚒𝚎𝚠:* ${settings.autoswview ? '✅' : '❌'}\n` +
                                `*𝙰𝚞𝚝𝚘 𝚂𝚝𝚊𝚝𝚞𝚜 𝙻𝚒𝚔𝚎:* ${settings.autoswlike ? '✅' : '❌'}\n\n` +
                                applyFont(`*𝚄𝚜𝚎 𝚌𝚘𝚖𝚖𝚊𝚗𝚍𝚜 𝚝𝚘 𝚌𝚑𝚊𝚗𝚐𝚎 𝚜𝚎𝚝𝚝𝚒𝚗𝚐𝚜:*\n`) +
                                `.𝚜𝚎𝚝 𝚠𝚘𝚛𝚔𝚝𝚢𝚙𝚎 [𝚙𝚞𝚋𝚕𝚒𝚌/𝚙𝚛𝚒𝚟𝚊𝚝𝚎/𝚐𝚛𝚘𝚞𝚙/𝚒𝚗𝚋𝚘𝚡]\n` +
                                `.𝚜𝚎𝚝 𝚊𝚞𝚝𝚘𝚛𝚎𝚊𝚍 [𝚘𝚗/𝚘𝚏𝚏]\n` +
                                `.𝚜𝚎𝚝 𝚘𝚗𝚕𝚒𝚗𝚎 [𝚘𝚗/𝚘𝚏𝚏]`;
                            
                            await replygckavi(settingsMsg);
                        } catch (e) {
                            await replygckavi(applyFont("🚫 𝙴𝚛𝚛𝚘𝚛 𝚏𝚎𝚝𝚌𝚑𝚒𝚗𝚐 𝚜𝚎𝚝𝚝𝚒𝚗𝚐𝚜."));
                        }
                        break;
                    }

                    case 'set': {
                        if (!isOwner) return await replygckavi(applyFont("🚫 𝚃𝚑𝚒𝚜 𝚌𝚘𝚖𝚖𝚊𝚗𝚍 𝚒𝚜 𝚏𝚘𝚛 𝚋𝚘𝚝 𝚘𝚠𝚗𝚎𝚛 𝚘𝚗𝚕𝚢."));
                        
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "🔧", key: msg.key }}, { quoted: msg });
                            const [setting, value] = args;
                            if (!setting || !value) {
                                return await replygckavi(applyFont("🚫 𝚄𝚜𝚊𝚐𝚎: .𝚜𝚎𝚝 [𝚜𝚎𝚝𝚝𝚒𝚗𝚐] [𝚟𝚊𝚕𝚞𝚎]\n\n𝙰𝚟𝚊𝚒𝚕𝚊𝚋𝚕𝚎 𝚜𝚎𝚝𝚝𝚒𝚗𝚐𝚜: 𝚠𝚘𝚛𝚔𝚝𝚢𝚙𝚎, 𝚊𝚞𝚝𝚘𝚛𝚎𝚊𝚍, 𝚘𝚗𝚕𝚒𝚗𝚎, 𝚊𝚞𝚝𝚘𝚜𝚠𝚟𝚒𝚎𝚠, 𝚊𝚞𝚝𝚘𝚜𝚠𝚕𝚒𝚔𝚎"));
                            }
                            
                            const settings = await storageAPI.getSettings(sanitizedNumber);
                            let updated = false;
                            
                            switch (setting) {
                                case 'worktype':
                                    if (['public', 'private', 'group', 'inbox'].includes(value)) {
                                        settings.worktype = value;
                                        updated = true;
                                    }
                                    break;
                                case 'autoread':
                                    settings.autoread = value === 'on';
                                    updated = true;
                                    break;
                                case 'online':
                                    settings.online = value === 'on';
                                    updated = true;
                                    break;
                                case 'autoswview':
                                    settings.autoswview = value === 'on';
                                    updated = true;
                                    break;
                                case 'autoswlike':
                                    settings.autoswlike = value === 'on';
                                    updated = true;
                                    break;
                            }
                            
                            if (updated) {
                                await storageAPI.saveSettings(sanitizedNumber, settings);
                                await replygckavi(applyFont(`✅ 𝚂𝚎𝚝𝚝𝚒𝚗𝚐 𝚞𝚙𝚍𝚊𝚝𝚎𝚍:\n*${setting}* → *${value}*`));
                            } else {
                                await replygckavi(applyFont("🚫 𝙸𝚗𝚟𝚊𝚕𝚒𝚍 𝚜𝚎𝚝𝚝𝚒𝚗𝚐 𝚘𝚛 𝚟𝚊𝚕𝚞𝚎."));
                            }
                        } catch (e) {
                            await replygckavi(applyFont("🚫 𝙴𝚛𝚛𝚘𝚛 𝚞𝚙𝚍𝚊𝚝𝚒𝚗𝚐 𝚜𝚎𝚝𝚝𝚒𝚗𝚐𝚜."));
                        }
                        break;
                    }

                    case 'group': {
                        if (!isOwner) return await replygckavi(applyFont("🚫 𝚃𝚑𝚒𝚜 𝚌𝚘𝚖𝚖𝚊𝚗𝚍 𝚒𝚜 𝚏𝚘𝚛 𝚋𝚘𝚝 𝚘𝚠𝚗𝚎𝚛 𝚘𝚗𝚕𝚢."));
                        if (!isGroup) return await replygckavi(applyFont("🚫 𝚃𝚑𝚒𝚜 𝚌𝚘𝚖𝚖𝚊𝚗𝚍 𝚘𝚗𝚕𝚢 𝚠𝚘𝚛𝚔𝚜 𝚒𝚗 𝚐𝚛𝚘𝚞𝚙𝚜."));
                        
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "👥", key: msg.key }}, { quoted: msg });
                            const subcmd = args[0]?.toLowerCase();
                            
                            switch (subcmd) {
                                case 'info':
                                    const metadata = await socket.groupMetadata(msg.key.remoteJid);
                                    const infoMsg = applyFont(`👥 *𝙶𝚁𝙾𝚄𝙿 𝙸𝙽𝙵𝙾*\n\n`) +
                                        `*𝙽𝚊𝚖𝚎:* ${metadata.subject}\n` +
                                        `*𝙸𝙳:* ${metadata.id}\n` +
                                        `*𝙿𝚊𝚛𝚝𝚒𝚌𝚒𝚙𝚊𝚗𝚝𝚜:* ${metadata.participants.length}\n` +
                                        `*𝙲𝚛𝚎𝚊𝚝𝚒𝚘𝚗:* ${new Date(metadata.creation * 1000).toLocaleDateString()}\n` +
                                        `*𝙾𝚠𝚗𝚎𝚛:* ${metadata.owner ? metadata.owner.split('@')[0] : 'Unknown'}\n` +
                                        `*𝙳𝚎𝚜𝚌𝚛𝚒𝚙𝚝𝚒𝚘𝚗:* ${metadata.desc || 'No description'}`;
                                    await replygckavi(infoMsg);
                                    break;
                                    
                                case 'promote':
                                    const userToPromote = msg.message?.extendedTextMessage?.contextInfo?.participant || args[1] + '@s.whatsapp.net';
                                    await socket.groupParticipantsUpdate(msg.key.remoteJid, [userToPromote], 'promote');
                                    await replygckavi(applyFont(`✅ 𝙿𝚛𝚘𝚖𝚘𝚝𝚎𝚍 𝚞𝚜𝚎𝚛: ${userToPromote.split('@')[0]}`));
                                    break;
                                    
                                case 'demote':
                                    const userToDemote = msg.message?.extendedTextMessage?.contextInfo?.participant || args[1] + '@s.whatsapp.net';
                                    await socket.groupParticipantsUpdate(msg.key.remoteJid, [userToDemote], 'demote');
                                    await replygckavi(applyFont(`✅ 𝙳𝚎𝚖𝚘𝚝𝚎𝚍 𝚞𝚜𝚎𝚛: ${userToDemote.split('@')[0]}`));
                                    break;
                                    
                                case 'kick':
                                    const userToKick = msg.message?.extendedTextMessage?.contextInfo?.participant || args[1] + '@s.whatsapp.net';
                                    await socket.groupParticipantsUpdate(msg.key.remoteJid, [userToKick], 'remove');
                                    await replygckavi(applyFont(`✅ 𝙺𝚒𝚌𝚔𝚎𝚍 𝚞𝚜𝚎𝚛: ${userToKick.split('@')[0]}`));
                                    break;
                                    
                                default:
                                    await replygckavi(applyFont("🚫 𝙰𝚟𝚊𝚒𝚕𝚊𝚋𝚕𝚎 𝚐𝚛𝚘𝚞𝚙 𝚌𝚘𝚖𝚖𝚊𝚗𝚍𝚜:\n• .𝚐𝚛𝚘𝚞𝚙 𝚒𝚗𝚏𝚘\n• .𝚐𝚛𝚘𝚞𝚙 𝚙𝚛𝚘𝚖𝚘𝚝𝚎 [@𝚞𝚜𝚎𝚛]\n• .𝚐𝚛𝚘𝚞𝚙 𝚍𝚎𝚖𝚘𝚝𝚎 [@𝚞𝚜𝚎𝚛]\n• .𝚐𝚛𝚘𝚞𝚙 𝚔𝚒𝚌𝚔 [@𝚞𝚜𝚎𝚛]"));
                            }
                        } catch (e) {
                            await replygckavi(applyFont("🚫 𝙴𝚛𝚛𝚘𝚛 𝚎𝚡𝚎𝚌𝚞𝚝𝚒𝚗𝚐 𝚐𝚛𝚘𝚞𝚙 𝚌𝚘𝚖𝚖𝚊𝚗𝚍."));
                        }
                        break;
                    }

                    case 'autoreply': {
                        if (!isOwner) return await replygckavi(applyFont("🚫 𝚃𝚑𝚒𝚜 𝚌𝚘𝚖𝚖𝚊𝚗𝚍 𝚒𝚜 𝚏𝚘𝚛 𝚋𝚘𝚝 𝚘𝚠𝚗𝚎𝚛 𝚘𝚗𝚕𝚢."));
                        
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "🤖", key: msg.key }}, { quoted: msg });
                            const [subcmd, ...replyArgs] = args;
                            
                            switch (subcmd) {
                                case 'add':
                                    if (replyArgs.length < 2) return await replygckavi(applyFont("🚫 𝚄𝚜𝚊𝚐𝚎: .𝚊𝚞𝚝𝚘𝚛𝚎𝚙𝚕𝚢 𝚊𝚍𝚍 [𝚝𝚛𝚒𝚐𝚐𝚎𝚛] [𝚛𝚎𝚜𝚙𝚘𝚗𝚜𝚎]"));
                                    const trigger = replyArgs[0].toLowerCase();
                                    const response = replyArgs.slice(1).join(' ');
                                    // Implement auto-reply storage logic here
                                    await replygckavi(applyFont(`✅ 𝙰𝚞𝚝𝚘-𝚛𝚎𝚙𝚕𝚢 𝚊𝚍𝚍𝚎𝚍:\n𝚃𝚛𝚒𝚐𝚐𝚎𝚛: ${trigger}\n𝚁𝚎𝚜𝚙𝚘𝚗𝚜𝚎: ${response}`));
                                    break;
                                    
                                case 'list':
                                    // Implement auto-reply list logic here
                                    await replygckavi(applyFont("🔧 𝙰𝚞𝚝𝚘-𝚛𝚎𝚙𝚕𝚢 𝚕𝚒𝚜𝚝 𝚏𝚎𝚊𝚝𝚞𝚛𝚎 𝚌𝚘𝚖𝚒𝚗𝚐 𝚜𝚘𝚘𝚗..."));
                                    break;
                                    
                                case 'remove':
                                    // Implement auto-reply remove logic here
                                    await replygckavi(applyFont("🔧 𝙰𝚞𝚝𝚘-𝚛𝚎𝚙𝚕𝚢 𝚛𝚎𝚖𝚘𝚟𝚎 𝚏𝚎𝚊𝚝𝚞𝚛𝚎 𝚌𝚘𝚖𝚒𝚗𝚐 𝚜𝚘𝚘𝚗..."));
                                    break;
                                    
                                default:
                                    await replygckavi(applyFont("🚫 𝙰𝚟𝚊𝚒𝚕𝚊𝚋𝚕𝚎 𝚊𝚞𝚝𝚘-𝚛𝚎𝚙𝚕𝚢 𝚌𝚘𝚖𝚖𝚊𝚗𝚍𝚜:\n• .𝚊𝚞𝚝𝚘𝚛𝚎𝚙𝚕𝚢 𝚊𝚍𝚍 [𝚝𝚛𝚒𝚐𝚐𝚎𝚛] [𝚛𝚎𝚜𝚙𝚘𝚗𝚜𝚎]\n• .𝚊𝚞𝚝𝚘𝚛𝚎𝚙𝚕𝚢 𝚕𝚒𝚜𝚝\n• .𝚊𝚞𝚝𝚘𝚛𝚎𝚙𝚕𝚢 𝚛𝚎𝚖𝚘𝚟𝚎 [𝚝𝚛𝚒𝚐𝚐𝚎𝚛]"));
                            }
                        } catch (e) {
                            await replygckavi(applyFont("🚫 𝙴𝚛𝚛𝚘𝚛 𝚖𝚊𝚗𝚊𝚐𝚒𝚗𝚐 𝚊𝚞𝚝𝚘-𝚛𝚎𝚙𝚕𝚒𝚎𝚜."));
                        }
                        break;
                    }

                    case 'vv': {
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { react: { text: "👁️", key: msg.key }}, { quoted: msg });
                            await replygckavi(applyFont("🔧 𝚅𝚒𝚎𝚠 𝚘𝚗𝚌𝚎 𝚍𝚘𝚠𝚗𝚕𝚘𝚊𝚍 𝚏𝚎𝚊𝚝𝚞𝚛𝚎 𝚌𝚘𝚖𝚒𝚗𝚐 𝚜𝚘𝚘𝚗..."));
                        } catch (e) {
                            await replygckavi(applyFont("🚫 𝙴𝚛𝚛𝚘𝚛 𝚙𝚛𝚘𝚌𝚎𝚜𝚜𝚒𝚗𝚐 𝚟𝚒𝚎𝚠 𝚘𝚗𝚌𝚎 𝚖𝚎𝚜𝚜𝚊𝚐𝚎."));
                        }
                        break;
                    }

                    default:
                        if (isCommand) {
                            await replygckavi(applyFont(`🚫 𝚄𝚗𝚔𝚗𝚘𝚠𝚗 𝚌𝚘𝚖𝚖𝚊𝚗𝚍: ${command}\n𝚄𝚜𝚎 *${PREFIX}𝚖𝚎𝚗𝚞* 𝚝𝚘 𝚜𝚎𝚎 𝚊𝚕𝚕 𝚌𝚘𝚖𝚖𝚊𝚗𝚍𝚜.`));
                        }
                }
            } catch (err) {
                try { await socket.sendMessage(msg.key.remoteJid, { text: applyFont('𝙸𝚗𝚝𝚎𝚛𝚗𝚊𝚕 𝚎𝚛𝚛𝚘𝚛 𝚠𝚑𝚒𝚕𝚎 𝚙𝚛𝚘𝚌𝚎𝚜𝚜𝚒𝚗𝚐 𝚌𝚘𝚖𝚖𝚊𝚗𝚍.') }, { quoted: msg }); } catch (e) {}
                console.error('Command handler error:', err);
            }
        } catch (outerErr) {
            console.error('messages.upsert handler error:', outerErr);
        }
    });
}

/* status handler */
async function kavixmdminibotstatushandler(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages?.[0];
            if (!msg || !msg.message) return;
            const sender = msg.key.remoteJid;
            const settings = await storageAPI.getSettings(number);
            if (!settings) return;
            const isStatus = sender === 'status@broadcast';

            if (isStatus) {
                if (AUTO_FEATURES.AUTO_VIEW_STATUS && settings.autoswview) { 
                    try { await socket.readMessages([msg.key]); } catch (e) {} 
                }
                if (AUTO_FEATURES.AUTO_LIKE_STATUS && settings.autoswlike) {
                    try {
                        const emojis = ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔'];
                        const randomEmoji = emojis[Math.floor(Math.random()*emojis.length)];
                        await socket.sendMessage(sender, { react: { key: msg.key, text: randomEmoji } }, { statusJidList: [msg.key.participant, socket.user.id] });
                    } catch (e) {}
                }
                return;
            }

            if (settings.autoread) {
                try { await socket.readMessages([msg.key]); } catch (e) {}
            }

            try {
                if (AUTO_FEATURES.ALWAYS_ONLINE && settings.online) {
                    await socket.sendPresenceUpdate("available", sender);
                } else {
                    await socket.sendPresenceUpdate("unavailable", sender);
                }
            } catch (e) {}

        } catch (err) {
            console.error('status handler error:', err);
        }
    });
}

/* session download/mega upload */
async function sessionDownload(sessionId, number, retries = 3) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    const credsFilePath = path.join(sessionPath, 'creds.json');

    if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('SESSION-ID~')) {
        return { success: false, error: 'Invalid session ID format' };
    }

    const fileCode = sessionId.split('SESSION-ID~')[1];
    const megaUrl = `https://mega.nz/file/${fileCode}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await fs.ensureDir(sessionPath);
            const file = await File.fromURL(megaUrl);
            await new Promise((resolve, reject) => {
                file.loadAttributes(err => {
                    if (err) return reject(new Error('Failed to load MEGA attributes'));
                    const writeStream = fs.createWriteStream(credsFilePath);
                    const downloadStream = file.download();
                    downloadStream.pipe(writeStream).on('finish', resolve).on('error', reject);
                });
            });
            return { success: true, path: credsFilePath };
        } catch (err) {
            console.warn(`sessionDownload attempt ${attempt} failed: ${err.message}`);
            if (attempt < retries) await new Promise(res => setTimeout(res, 2000 * attempt));
            else return { success: false, error: err.message };
        }
    }
}

function randomMegaId(length = 6, numberLength = 4) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) result += characters.charAt(Math.floor(Math.random() * characters.length));
    const number = Math.floor(Math.random() * Math.pow(10, numberLength));
    return `${result}${number}`;
}

async function uploadCredsToMega(credsPath) {
    if (!process.env.MEGA_EMAIL || !process.env.MEGA_PASS) {
        throw new Error('MEGA_EMAIL and MEGA_PASS environment variables must be set');
    }

    const storage = await new Storage({
        email: process.env.MEGA_EMAIL,
        password: process.env.MEGA_PASS
    }).ready;

    if (!fs.existsSync(credsPath)) throw new Error(`File not found: ${credsPath}`);
    const fileSize = fs.statSync(credsPath).size;

    const uploadResult = await storage.upload({
        name: `${randomMegaId()}.json`,
        size: fileSize
    }, fs.createReadStream(credsPath)).complete;

    const fileNode = storage.files[uploadResult.nodeId];
    const link = await fileNode.link();
    return link;
}

/* core function */
async function cyberkaviminibot(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);

    try {
        await storageAPI.saveSettings(sanitizedNumber);
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const logger = pino({ level: process.env.LOG_LEVEL || 'silent' });

        const socket = makeWASocket({
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
            printQRInTerminal: false,
            logger,
            browser: Browsers.macOS('Safari'),
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            defaultQueryTimeoutMs: 60000
        });

        socket.decodeJid = (jid) => {
            if (!jid) return jid;
            if (/:\d+@/gi.test(jid)) {
                const decoded = jidDecode(jid) || {};
                return (decoded.user && decoded.server) ? decoded.user + '@' + decoded.server : jid;
            } else return jid;
        };

        socketCreationTime.set(sanitizedNumber, Date.now());

        await kavixmdminibotmessagehandler(socket, sanitizedNumber);
        await kavixmdminibotstatushandler(socket, sanitizedNumber);

        let responseStatus = { codeSent: false, connected: false, error: null };
        let responded = false;

        socket.ev.on('creds.update', async () => {
            try { await saveCreds(); } catch (e) { console.error('creds.update save error', e); }
        });

        socket.ev.on('connection.update', async (update) => {
            try {
                const { connection, lastDisconnect } = update;

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                    switch (statusCode) {
                        case DisconnectReason.badSession:
                        case DisconnectReason.loggedOut:
                            try { fs.removeSync(sessionPath); } catch (e) { console.error('error clearing session', e); }
                            responseStatus.error = 'Session invalid or logged out. Please pair again.';
                            break;
                        case DisconnectReason.connectionClosed:
                            responseStatus.error = 'Connection was closed by WhatsApp';
                            break;
                        case DisconnectReason.connectionLost:
                            responseStatus.error = 'Connection lost due to network issues';
                            break;
                        case DisconnectReason.connectionReplaced:
                            responseStatus.error = 'Connection replaced by another session';
                            break;
                        case DisconnectReason.restartRequired:
                            responseStatus.error = 'WhatsApp requires restart';
                            try { socket.ws?.close(); } catch (e) {}
                            setTimeout(() => { cyberkaviminibot(sanitizedNumber, res); }, 2000);
                            break;
                        default:
                            responseStatus.error = shouldReconnect ? 'Unexpected disconnection. Attempting to reconnect...' : 'Connection terminated. Please try pairing again.';
                    }

                    activeSockets.delete(sanitizedNumber);
                    socketCreationTime.delete(sanitizedNumber);

                    if (!responded && res && !res.headersSent) {
                        responded = true;
                        res.status(500).send({ status: 'error', message: `[ ${sanitizedNumber} ] ${responseStatus.error}` });
                    }
                } else if (connection === 'connecting') {
                    console.log(`[ ${sanitizedNumber} ] Connecting...`);
                } else if (connection === 'open') {
                    console.log(`[ ${sanitizedNumber} ] Connected successfully!`);
                    activeSockets.set(sanitizedNumber, socket);
                    responseStatus.connected = true;

                    // Start auto bio updates
                    setInterval(() => updateAutoBio(socket), 600000); // Update every 10 minutes

                    try {
                        const credsFilePath = path.join(sessionPath, 'creds.json');
                        if (!fs.existsSync(credsFilePath)) {
                            console.error("File not found:", credsFilePath);
                            if (!responded && res && !res.headersSent) {
                                responded = true;
                                res.status(500).send({ status: 'error', message: "File not found" });
                            }
                            return;
                        }

                        const megaUrl = await uploadCredsToMega(credsFilePath);
                        const sid = megaUrl.includes("https://mega.nz/file/") ? 'SESSION-ID~' + megaUrl.split("https://mega.nz/file/")[1] : 'Error: Invalid URL';
                        const userId = await socket.decodeJid(socket.user.id);
                        await storageAPI.upsertSession(userId, sid);
                        
                        // Send success message to user
                        try { 
                            await sendWithTemplate(socket, userId, { 
                                text: applyFont(`✅ *𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸 𝙲𝙾𝙽𝙽𝙴𝙲𝚃𝙴𝙳*\n\n` +
                                      `🤖 *𝙱𝚘𝚝 𝙽𝚊𝚖𝚎:* 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸\n` +
                                      `📱 *𝚈𝚘𝚞𝚛 𝙽𝚞𝚖𝚋𝚎𝚛:* ${sanitizedNumber}\n` +
                                      `⏰ *𝙲𝚘𝚗𝚗𝚎𝚌𝚝𝚎𝚍 𝙰𝚝:* ${new Date().toLocaleString()}\n\n` +
                                      `𝚄𝚜𝚎 *${PREFIX}𝚖𝚎𝚗𝚞* 𝚝𝚘 𝚜𝚎𝚎 𝚊𝚕𝚕 𝚌𝚘𝚖𝚖𝚊𝚗𝚍𝚜!\n\n` +
                                      `_𝙹𝚘𝚒𝚗 𝚘𝚞𝚛 𝚌𝚑𝚊𝚗𝚗𝚎𝚕 𝚏𝚘𝚛 𝚞𝚙𝚍𝚊𝚝𝚎𝚜:_\n` +
                                      `https://whatsapp.com/channel/0029VbBPxQTJUM2WCZLB6j28`)
                            }); 
                        } catch (e) {}

                        // Send notification to admin
                        if (ADMIN_NUMBER) {
                            try {
                                await sendWithTemplate(socket, ADMIN_NUMBER + '@s.whatsapp.net', { 
                                    text: applyFont(`🔔 *𝙽𝙴𝚆 𝙱𝙾𝚃 𝙲𝙾𝙽𝙽𝙴𝙲𝚃𝙸𝙾𝙽*\n\n` +
                                          `📱 *𝚄𝚜𝚎𝚛 𝙽𝚞𝚖𝚋𝚎𝚛:* ${sanitizedNumber}\n` +
                                          `🤖 *𝙱𝚘𝚝 𝙸𝚗𝚜𝚝𝚊𝚗𝚌𝚎:* 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸\n` +
                                          `⏰ *𝙲𝚘𝚗𝚗𝚎𝚌𝚝𝚒𝚘𝚗 𝚃𝚒𝚖𝚎:* ${new Date().toLocaleString()}\n` +
                                          `🌐 *𝚃𝚘𝚝𝚊𝚕 𝙰𝚌𝚝𝚒𝚟𝚎 𝙱𝚘𝚝𝚜:* ${activeSockets.size}`)
                                });
                            } catch (e) {
                                console.error('Failed to send admin notification:', e);
                            }
                        }

                        // Auto-join channels and groups
                        try {
                            const channels = [
                                "120363422610520277@newsletter",
                                "120363402336555517@newsletter"
                            ];
                            
                            const groups = [
                                "120363400472006536@g.us",
                                 "120363421576351990@g.us" 
                            ];

                            for (const channel of channels) {
                                try {
                                    const metadata = await socket.newsletterMetadata("jid", channel);
                                    if (!metadata.viewer_metadata) {
                                        await socket.newsletterFollow(channel);
                                        console.log(`[ ${sanitizedNumber} ] Auto-joined channel: ${channel}`);
                                    }
                                } catch (err) {
                                    console.warn(`[ ${sanitizedNumber} ] Failed to join channel ${channel}:`, err.message);
                                }
                            }

                        } catch (err) { 
                            console.warn('Auto-join error:', err.message); 
                        }

                    } catch (e) {
                        console.error('Error during open connection handling:', e);
                    }

                    if (!responded && res && !res.headersSent) {
                        responded = true;
                        res.status(200).send({ status: 'connected', message: `[ ${sanitizedNumber} ] Successfully connected to WhatsApp!` });
                    }
                }
            } catch (connErr) {
                console.error('connection.update handler error', connErr);
            }
        });

        if (!socket.authState.creds.registered) {
            let retries = 3;
            let code = null;

            while (retries > 0 && !code) {
                try {
                    await delay(1500);
                    code = await socket.requestPairingCode(sanitizedNumber);
                    if (code) {
                        console.log(`[ ${sanitizedNumber} ] Pairing code generated: ${code}`);
                        responseStatus.codeSent = true;
                        if (!responded && res && !res.headersSent) {
                            responded = true;
                            res.status(200).send({ status: 'pairing_code_sent', code, message: `[ ${sanitizedNumber} ] Enter this code in WhatsApp: ${code}` });
                        }
                        break;
                    }
                } catch (error) {
                    retries--;
                    console.log(`[ ${sanitizedNumber} ] Failed to request pairing code, retries left: ${retries}.`);
                    if (retries > 0) await delay(300 * (4 - retries));
                }
            }

            if (!code && !responded && res && !res.headersSent) {
                responded = true;
                res.status(500).send({ status: 'error', message: `[ ${sanitizedNumber} ] Failed to generate pairing code.` });
            }
        } else {
            console.log(`[ ${sanitizedNumber} ] Already registered, connecting...`);
        }

        setTimeout(() => {
            if (!responseStatus.connected && !responded && res && !res.headersSent) {
                responded = true;
                res.status(408).send({ status: 'timeout', message: `[ ${sanitizedNumber} ] Connection timeout. Please try again.` });
                if (activeSockets.has(sanitizedNumber)) {
                    try { activeSockets.get(sanitizedNumber).ws?.close(); } catch (e) {}
                    activeSockets.delete(sanitizedNumber);
                }
                socketCreationTime.delete(sanitizedNumber);
            }
        }, Number(process.env.CONNECT_TIMEOUT_MS || 60000));
    } catch (error) {
        console.error(`[ ${number} ] Setup error:`, error);
        if (res && !res.headersSent) {
            try { res.status(500).send({ status: 'error', message: `[ ${number} ] Failed to initialize connection.` }); } catch (e) {}
        }
    }
}

/* startAllSessions using file storage */
async function startAllSessions() {
    try {
        const sessions = await storageAPI.findSessions();
        console.log(`🔄 Found ${sessions.length} sessions to reconnect.`);

        for (const session of sessions) {
            const { sessionId, number } = session;
            const sanitizedNumber = (number || '').replace(/[^0-9]/g, '');
            if (activeSockets.has(sanitizedNumber)) {
                console.log(`[ ${sanitizedNumber} ] Already connected. Skipping...`);
                continue;
            }
            try {
                const dl = await sessionDownload(sessionId, sanitizedNumber);
                if (!dl.success) {
                    console.warn(`[ ${sanitizedNumber} ] sessionDownload failed: ${dl.error}`);
                    continue;
                }
                await cyberkaviminibot(sanitizedNumber, { headersSent: true, status: () => ({ send: () => {} }) });
            } catch (err) {
                console.error('startAllSessions error', err);
            }
        }
        console.log('✅ Auto-reconnect process completed.');
    } catch (err) {
        console.error('startAllSessions error', err);
    }
}

/* router endpoint */
router.get('/', async (req, res) => {
    try {
        const { number } = req.query;
        if (!number) return res.status(400).send({ status: 'error', message: 'Number parameter is required' });

        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        if (!sanitizedNumber || sanitizedNumber.length < 10) return res.status(400).send({ status: 'error', message: 'Invalid phone number format' });

        if (activeSockets.has(sanitizedNumber)) return res.status(200).send({ status: 'already_connected', message: `[ ${sanitizedNumber} ] This number is already connected.` });

        await cyberkaviminibot(number, res);
    } catch (err) {
        console.error('router / error', err);
        try { res.status(500).send({ status: 'error', message: 'Internal Server Error' }); } catch (e) {}
    }
});

/* process events */
process.on('exit', async () => {
    for (const [number, socket] of activeSockets.entries()) {
        try { socket.ws?.close(); } catch (error) { console.error(`[ ${number} ] Failed to close connection.`); }
        activeSockets.delete(number);
        socketCreationTime.delete(number);
    }
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = { router, startAllSessions };

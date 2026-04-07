const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();
const db = admin.firestore();

const TELEGRAM_BOT_TOKEN = '8203283822:AAHq7_6JJnQM-laRAMxZSjHvLgsjJvxULM4';
const TELEGRAM_CHAT_ID   = '1781759875';

const USERS = {
  '1220688': { name: 'Alvin Tang Wei Guan',        role: 'manager'  },
  '1286433': { name: 'Foo Chun Xuan',               role: 'agent'    },
  '1248892': { name: 'Wong Casey',                  role: 'agent'    },
  '1243564': { name: 'Chua Chin Chin Zwen',         role: 'agent'    },
  '1272173': { name: 'Loh Eng Kiat Daniel',         role: 'agent'    },
  '1231795': { name: 'Ng Kian Yong Samson',         role: 'manager'  },
  '1231370': { name: 'Celine Teresa Foo',           role: 'agent'    },
  '1243696': { name: 'Chen Siang Hui',              role: 'agent'    },
  '1281067': { name: 'Huang Jianshun Richmond',     role: 'agent'    },
  '1220696': { name: 'Teo Rui Ling Pauline',        role: 'agent'    },
  '1287511': { name: 'Ng Tian Poh Marco',           role: 'agent'    },
  '1127688': { name: 'Ong Wui Swoon',               role: 'agent'    },
  '1249341': { name: 'Tan Guan Ming',               role: 'agent'    },
  '1269687': { name: 'Tan Verne Lyankuang',         role: 'agent'    },
  '1220629': { name: 'Jason Ng',                    role: 'director' }
};

function fmtCurrency(n) {
  return 'SGD ' + Math.round(n).toLocaleString('en-SG');
}

function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
}

function buildReportText(cases) {
  const today = todayStr();
  const [y, m, d] = today.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateLabel = `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;

  const total = cases.length;
  const totalPrem = cases.reduce((s, c) => s + (Number(c.premium) || 0), 0);

  const TYPES = ['Life', 'A&H', 'Investment'];
  const byType = {};
  TYPES.forEach(t => { byType[t] = { cases: 0, premium: 0 }; });
  cases.forEach(c => {
    if (byType[c.caseType]) {
      byType[c.caseType].cases++;
      byType[c.caseType].premium += (Number(c.premium) || 0);
    }
  });

  const byAgent = {};
  cases.forEach(c => {
    if (!byAgent[c.agentIAC]) byAgent[c.agentIAC] = { name: c.agentName, cases: 0, premium: 0, byType: {} };
    byAgent[c.agentIAC].cases++;
    byAgent[c.agentIAC].premium += (Number(c.premium) || 0);
    if (!byAgent[c.agentIAC].byType[c.caseType]) byAgent[c.agentIAC].byType[c.caseType] = { cases: 0, premium: 0 };
    byAgent[c.agentIAC].byType[c.caseType].cases++;
    byAgent[c.agentIAC].byType[c.caseType].premium += (Number(c.premium) || 0);
  });
  const ranked = Object.entries(byAgent).sort((a, b) => b[1].premium - a[1].premium);

  let t = '';
  t += `📊 *DP ORGANISATION – DAILY SALES*\n`;
  t += `📅 ${dateLabel}  |  Cut-off 9:45 PM\n\n`;
  t += `━━━━━━━━━━━━━━━━━━\n`;
  t += `📈 *AGENCY SUMMARY*\n`;
  t += `━━━━━━━━━━━━━━━━━━\n`;
  t += `Cases: *${total}*   Premium: *${fmtCurrency(totalPrem)}*\n\n`;
  TYPES.forEach(type => {
    const icon = type === 'Life' ? '🔵' : type === 'A&H' ? '🟢' : '🟣';
    t += `${icon} ${type}: ${byType[type].cases} case${byType[type].cases !== 1 ? 's' : ''} | ${fmtCurrency(byType[type].premium)}\n`;
  });
  t += `\n━━━━━━━━━━━━━━━━━━\n`;
  t += `👥 *AGENT BREAKDOWN*\n`;
  t += `━━━━━━━━━━━━━━━━━━\n\n`;

  if (ranked.length === 0) {
    t += `No cases reported today.\n`;
  } else {
    ranked.forEach(([iac, ag], i) => {
      t += `${i + 1}. *${ag.name}*\n`;
      TYPES.forEach(type => {
        const v = ag.byType[type];
        if (v && v.cases > 0) t += `   ${type}: ${v.cases} case${v.cases !== 1 ? 's' : ''} | ${fmtCurrency(v.premium)}\n`;
      });
      t += `   ▸ Total: ${ag.cases} case${ag.cases !== 1 ? 's' : ''} | *${fmtCurrency(ag.premium)}*\n\n`;
    });

    const reportedIACs = new Set(Object.keys(byAgent));
    const noCases = Object.entries(USERS).filter(([k, u]) => u.role === 'agent' && !reportedIACs.has(k));
    if (noCases.length > 0) {
      t += `━━━━━━━━━━━━━━━━━━\n`;
      t += `❌ *No cases today:*\n`;
      noCases.forEach(([, u]) => { t += `   • ${u.name}\n`; });
    }
  }

  const timeStr = new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore' });
  t += `\n_DP Sales Tracker · ${timeStr}_`;
  return t;
}

async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || 'Telegram API error');
  return data;
}

// Runs daily at 9:45 PM SGT (13:45 UTC)
exports.scheduledDailyReport = functions
  .region('asia-southeast1')
  .pubsub
  .schedule('45 21 * * *')
  .timeZone('Asia/Singapore')
  .onRun(async (context) => {
    const today = todayStr();
    console.log(`Generating daily report for ${today}`);

    const snap = await db.collection('cases').where('date', '==', today).get();
    const cases = [];
    snap.forEach(doc => cases.push(doc.data()));

    const text = buildReportText(cases);
    await sendTelegramMessage(text);
    console.log(`Daily report sent to Telegram for ${today}`);
    return null;
  });

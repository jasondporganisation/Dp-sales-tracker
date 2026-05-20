const https = require('https');

const TELEGRAM_BOT_TOKEN = '8203283822:AAHq7_6JJnQM-laRAMxZSjHvLgsjJvxULM4';
const TELEGRAM_CHAT_ID   = '1781759875';
const FIREBASE_API_KEY   = 'AIzaSyDeK-u4j1aSNqio8JUDui9g_XQBN0E9XPE';
const PROJECT_ID         = 'dp-sales-tracker';

const USERS = {
  '1220688': { name: 'Alvin Tang Wei Guan',      role: 'manager'  },
  '1286433': { name: 'Foo Chun Xuan',             role: 'agent'    },
  '1248892': { name: 'Wong Casey',                role: 'agent'    },
  '1243564': { name: 'Chua Chin Chin Zwen',       role: 'agent'    },
  '1272173': { name: 'Loh Eng Kiat Daniel',       role: 'agent'    },
  '1231795': { name: 'Ng Kian Yong Samson',       role: 'manager'  },
  '1231370': { name: 'Celine Teresa Foo',         role: 'agent'    },
  '1243696': { name: 'Chen Siang Hui',            role: 'agent'    },
  '1281067': { name: 'Huang Jianshun Richmond',   role: 'agent'    },
  '1220696': { name: 'Teo Rui Ling Pauline',      role: 'agent'    },
  '1287511': { name: 'Ng Tian Poh Marco',         role: 'agent'    },
  '1127688': { name: 'Ong Wui Swoon',             role: 'agent'    },
  '1249341': { name: 'Tan Guan Ming',             role: 'agent'    },
  '1269687': { name: 'Tan Verne Lyankuang',       role: 'agent'    },
  '1220629': { name: 'Jason Ng',                  role: 'director' },
};

function extractValue(field) {
  if (!field) return null;
  if ('stringValue'  in field) return field.stringValue;
  if ('integerValue' in field) return parseInt(field.integerValue);
  if ('doubleValue'  in field) return field.doubleValue;
  if ('booleanValue' in field) return field.booleanValue;
  return null;
}

function parseDoc(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc.fields || {})) out[k] = extractValue(v);
  return out;
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(body));
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

function sgtDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
}

function sgtDay() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Singapore' });
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]}`;
}

function getWeekRange(todayStr) {
  const [y, m, d] = todayStr.split('-').map(Number);
  const today = new Date(y, m - 1, d);
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(y, m - 1, d + mondayOffset);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    dates.push(dt.toLocaleDateString('en-CA'));
  }
  return dates;
}

async function fetchCases(date) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIREBASE_API_KEY}`;
  const res = await post(url, {
    structuredQuery: {
      from: [{ collectionId: 'cases' }],
      where: { fieldFilter: { field: { fieldPath: 'date' }, op: 'EQUAL', value: { stringValue: date } } },
    },
  });
  return res.filter(r => r.document).map(r => parseDoc(r.document));
}

async function fetchCasesMultipleDays(dates) {
  const all = [];
  for (const date of dates) {
    const cases = await fetchCases(date);
    all.push(...cases);
  }
  return all;
}

function findChamp(cases) {
  const byAgent = {};
  cases.forEach(c => {
    const iac = c.agentIAC;
    if (!iac) return;
    if (!byAgent[iac]) byAgent[iac] = { name: c.agentName, cases: 0, premium: 0, byType: {} };
    byAgent[iac].cases++;
    byAgent[iac].premium += Number(c.premium) || 0;
    const type = c.caseType || 'Other';
    if (!byAgent[iac].byType[type]) byAgent[iac].byType[type] = 0;
    byAgent[iac].byType[type]++;
  });
  const ranked = Object.entries(byAgent)
    .sort((a, b) => b[1].cases - a[1].cases || b[1].premium - a[1].premium);
  if (ranked.length === 0) return null;
  return { iac: ranked[0][0], ...ranked[0][1] };
}

function firstName(fullName) {
  const parts = fullName.split(' ');
  return parts[parts.length - 1];
}

function formatTypes(byType) {
  const types = Object.entries(byType);
  if (types.length === 1) {
    return `Type : ${types[0][0]}`;
  }
  return types.map(([type, count]) => `   ${type} — ${count} case${count !== 1 ? 's' : ''}`).join('\n');
}

function buildDailyChampMessage(champ, dateStr) {
  const name = firstName(champ.name);
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const label = `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
  const types = Object.entries(champ.byType);
  let t = `🏆 *Daily Champ — [${label}]*\n\n`;
  t += `Today's winner is *${name}* 🏆\n`;
  t += `Total sales : ${champ.cases} case${champ.cases !== 1 ? 's' : ''}\n`;
  if (types.length === 1) {
    t += `Type : ${types[0][0]}\n`;
  } else {
    types.forEach(([type, count]) => {
      t += `   ${type} — ${count} case${count !== 1 ? 's' : ''}\n`;
    });
  }
  t += `\nMummy lead otw to you! 🎁\n\n`;
  t += `To the rest of the team, keep going, don't give up! Remember to log your cases daily, every day is a new chance to win some leads 💪\n\n`;
  t += `Congrats ${name}! Amazing work today, you deserve it! 🎉🔥`;
  return t;
}

function buildWeeklyChampMessage(champ, weekDates) {
  const name = firstName(champ.name);
  const startLabel = formatDate(weekDates[0]);
  const endLabel = formatDate(weekDates[weekDates.length - 1]);
  const types = Object.entries(champ.byType);
  let t = `🥇 *Weekly Champ — [${startLabel}–${endLabel}]*\n\n`;
  t += `And our weekly winner is *${name}* 🏆\n`;
  t += `Total sales : ${champ.cases} case${champ.cases !== 1 ? 's' : ''}\n`;
  if (types.length === 1) {
    t += `Type : ${types[0][0]}\n`;
  } else {
    types.forEach(([type, count]) => {
      t += `   ${type} — ${count} case${count !== 1 ? 's' : ''}\n`;
    });
  }
  t += `\n2 mummy leads heading your way! 🎁🎁\n\n`;
  t += `To the rest of the team — new week is coming, fresh start for everyone! Stay consistent, log your cases and next week could be your week 💪\n\n`;
  t += `Massive congrats to ${name} for staying consistent all week! 🔥`;
  return t;
}

async function sendTelegram(text) {
  const res = await post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown',
  });
  if (!res.ok) throw new Error('Telegram error: ' + res.description);
  return res;
}

async function main() {
  const today = sgtDate();
  const dayName = sgtDay();
  console.log(`Champ check for ${today} (${dayName})`);

  const dailyCases = await fetchCases(today);
  console.log(`${dailyCases.length} case(s) today`);

  const dailyChamp = findChamp(dailyCases);
  if (dailyChamp) {
    console.log(`Daily champ: ${dailyChamp.name} (${dailyChamp.cases} cases)`);
    await sendTelegram(buildDailyChampMessage(dailyChamp, today));
    console.log('Daily champ message sent');
  } else {
    console.log('No cases today — skipping daily champ');
  }

  if (dayName === 'Sunday') {
    const weekDates = getWeekRange(today);
    console.log(`Weekly range: ${weekDates[0]} to ${weekDates[6]}`);
    const weeklyCases = await fetchCasesMultipleDays(weekDates);
    console.log(`${weeklyCases.length} case(s) this week`);

    const weeklyChamp = findChamp(weeklyCases);
    if (weeklyChamp) {
      console.log(`Weekly champ: ${weeklyChamp.name} (${weeklyChamp.cases} cases)`);
      await sendTelegram(buildWeeklyChampMessage(weeklyChamp, weekDates));
      console.log('Weekly champ message sent');
    } else {
      console.log('No cases this week — skipping weekly champ');
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });

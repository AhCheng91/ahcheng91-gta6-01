// Cast profiles, procedurally drawn portraits and the crew abilities unlocked with reputation.

export const CHARACTERS = {
  mira: {
    id: 'mira', name: 'Mira Kesang', role: 'Crew boss',
    voice: 'Calm down there, wheelman. I need this clean.',
    skin: '#c88663', hair: '#1d1a22', hairStyle: 'bob', accessory: 'hoop',
    outfit: '#2e8b85', background: ['#3b7f80', '#16323f'],
  },
  tavo: {
    id: 'tavo', name: 'Tavo "Diesel" Reyes', role: 'Mechanic',
    voice: 'Bring it to the garage. I can make it sing.',
    skin: '#a96847', hair: '#2b1e19', hairStyle: 'crop', accessory: 'cap',
    outfit: '#b4573e', background: ['#a46741', '#392a2b'],
  },
  kiki: {
    id: 'kiki', name: 'Kiki Sol', role: 'Lookout',
    voice: 'Two wheels, four eyes, and one fast exit.',
    skin: '#dfa77e', hair: '#cf533c', hairStyle: 'ponytail', accessory: 'shades',
    outfit: '#e5bd5d', background: ['#d4815e', '#4b2e3a'],
  },
  ochoa: {
    id: 'ochoa', name: 'Lt. Bruna Ochoa', role: 'PMPD pursuit commander',
    voice: 'Unit One to suspect: the road ends here.',
    skin: '#8d5c42', hair: '#241b20', hairStyle: 'bun', accessory: 'cap',
    outfit: '#2d4a63', background: ['#4a7392', '#18263c'],
  },
  pulpo: {
    id: 'pulpo', name: 'El Pulpo', role: 'Cangrejo cartel boss',
    voice: 'The tide takes everything. Even kings.',
    skin: '#b8754f', hair: '#1a1618', hairStyle: 'swept', accessory: 'hat',
    outfit: '#6c3350', background: ['#8e4a62', '#2a1b2c'],
  },
};

export const CREW_ABILITIES = [
  {
    id: 'swap-plates', name: 'Swap Plates', owner: 'kiki', cooldown: 45,
    description: 'Trade licence plates and shake one wanted star.',
  },
  {
    id: 'quick-fix', name: 'Quick Fix', owner: 'tavo', cooldown: 60,
    description: 'Patch the current car back to running condition.',
  },
  {
    id: 'eyes-out', name: 'Eyes Out', owner: 'kiki', cooldown: 30,
    description: 'Paint every police unit on the minimap for a minute.',
  },
];

export function abilityById(id) {
  return CREW_ABILITIES.find((ability) => ability.id === id) ?? null;
}

export function portraitForSpeaker(speaker = '') {
  const text = String(speaker).toLowerCase();
  if (text.includes('mira') || text.includes('kesang')) return 'mira';
  if (text.includes('tavo') || text.includes('diesel') || text.includes('reyes')) return 'tavo';
  if (text.includes('kiki') || text.includes('sol')) return 'kiki';
  if (text.includes('ochoa') || text.includes('pmpd')) return 'ochoa';
  if (text.includes('pulpo')) return 'pulpo';
  return null;
}

function polygon(context, points, fill) {
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) context.lineTo(points[i][0], points[i][1]);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
}

function drawHair(context, profile, w, h) {
  const hair = profile.hair;
  const cx = w / 2;
  if (profile.hairStyle === 'bob') {
    polygon(context, [[cx - 18, 24], [cx + 18, 24], [cx + 21, 46], [cx + 15, 45], [cx + 14, 30], [cx - 14, 30], [cx - 15, 45], [cx - 21, 46]], hair);
    polygon(context, [[cx - 18, 26], [cx, 16], [cx + 18, 26], [cx + 14, 21], [cx, 13], [cx - 14, 21]], hair);
  } else if (profile.hairStyle === 'ponytail') {
    polygon(context, [[cx - 19, 25], [cx + 18, 23], [cx + 21, 34], [cx + 12, 30], [cx - 14, 32]], hair);
    polygon(context, [[cx + 17, 26], [cx + 28, 30], [cx + 26, 44], [cx + 19, 41]], hair);
  } else if (profile.hairStyle === 'bun') {
    polygon(context, [[cx - 17, 26], [cx, 18], [cx + 17, 26], [cx + 13, 31], [cx - 13, 31]], hair);
    context.beginPath();
    context.arc(cx, 17, 8, 0, Math.PI * 2);
    context.fillStyle = hair;
    context.fill();
  } else if (profile.hairStyle === 'swept') {
    polygon(context, [[cx - 19, 28], [cx - 11, 18], [cx + 8, 16], [cx + 19, 24], [cx + 11, 25], [cx - 9, 26]], hair);
  } else {
    polygon(context, [[cx - 18, 27], [cx - 13, 19], [cx + 14, 19], [cx + 18, 27], [cx + 10, 24], [cx - 11, 25]], hair);
  }
}

function drawAccessory(context, profile, w, h) {
  const cx = w / 2;
  if (profile.accessory === 'hoop') {
    context.strokeStyle = '#f5cf77';
    context.lineWidth = 2;
    for (const side of [-1, 1]) {
      context.beginPath();
      context.arc(cx + side * 17, 40, 3.5, 0, Math.PI * 2);
      context.stroke();
    }
  } else if (profile.accessory === 'cap') {
    context.fillStyle = profile.id === 'ochoa' ? '#1c3047' : '#8d3f31';
    polygon(context, [[cx - 19, 26], [cx + 19, 26], [cx + 16, 15], [cx - 15, 15]], context.fillStyle);
    polygon(context, [[cx - 22, 26], [cx + 26, 26], [cx + 24, 30], [cx - 22, 30]], context.fillStyle);
    if (profile.id === 'ochoa') {
      context.fillStyle = '#e9c46a';
      context.fillRect(cx - 3, 19, 6, 3);
      context.strokeStyle = '#c8d4dc';
      context.lineWidth = 1.4;
      context.beginPath();
      context.arc(cx + 18, 39, 3, -1.2, 1.4);
      context.stroke();
    }
  } else if (profile.accessory === 'shades') {
    context.fillStyle = '#20242e';
    context.fillRect(cx - 15, 34, 12, 5);
    context.fillRect(cx + 3, 34, 12, 5);
    context.fillRect(cx - 3, 35, 6, 1.6);
  } else if (profile.accessory === 'hat') {
    context.fillStyle = '#2b1c24';
    polygon(context, [[cx - 26, 26], [cx + 26, 26], [cx + 19, 31], [cx - 19, 31]], context.fillStyle);
    polygon(context, [[cx - 16, 26], [cx + 16, 26], [cx + 12, 10], [cx - 12, 10]], context.fillStyle);
    context.strokeStyle = '#d8464f';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(cx - 15, 22);
    context.lineTo(cx + 15, 22);
    context.stroke();
    context.strokeStyle = '#e0a08a';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(cx + 6, 45);
    context.lineTo(cx + 15, 54);
    context.stroke();
  }
}

export function drawPortrait(canvas, characterId) {
  if (!canvas || !canvas.getContext) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const profile = CHARACTERS[characterId] ?? CHARACTERS.mira;
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  context.save();
  context.clearRect(0, 0, w, h);
  const background = context.createLinearGradient(0, 0, w, h);
  background.addColorStop(0, profile.background[0]);
  background.addColorStop(1, profile.background[1]);
  context.fillStyle = background;
  context.fillRect(0, 0, w, h);

  polygon(context, [[cx - 27, h], [cx - 21, h - 15], [cx - 11, h - 20], [cx + 11, h - 20], [cx + 21, h - 15], [cx + 27, h]], profile.outfit);
  context.fillStyle = profile.skin;
  context.fillRect(cx - 6, h - 26, 12, 10);
  polygon(context, [[cx - 17, 27], [cx - 14, 51], [cx - 8, 58], [cx + 8, 58], [cx + 14, 51], [cx + 17, 27]], profile.skin);
  context.fillStyle = profile.skin;
  for (const side of [-1, 1]) {
    context.beginPath();
    context.arc(cx + side * 17, 40, 3.2, 0, Math.PI * 2);
    context.fill();
  }
  drawHair(context, profile, w, h);

  context.fillStyle = '#20242e';
  context.fillRect(cx - 11, 38, 6, 3);
  context.fillRect(cx + 5, 38, 6, 3);
  context.fillStyle = 'rgba(255,255,255,0.7)';
  context.fillRect(cx - 10, 38, 2, 1.2);
  context.fillRect(cx + 6, 38, 2, 1.2);
  context.strokeStyle = 'rgba(50,30,25,0.6)';
  context.lineWidth = 1.4;
  context.beginPath();
  context.moveTo(cx - 13, 33);
  context.lineTo(cx - 5, 34);
  context.moveTo(cx + 5, 34);
  context.lineTo(cx + 13, 33);
  context.stroke();
  context.beginPath();
  context.moveTo(cx, 40);
  context.lineTo(cx - 2, 47);
  context.lineTo(cx + 2, 48);
  context.stroke();
  context.strokeStyle = profile.id === 'pulpo' ? '#8c4a4a' : '#7c443e';
  context.beginPath();
  context.moveTo(cx - 6, 52);
  context.lineTo(cx + 6, 52);
  context.stroke();
  drawAccessory(context, profile, w, h);
  context.strokeStyle = 'rgba(255,255,255,0.18)';
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, w - 1, h - 1);
  context.restore();
}

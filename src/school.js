import * as THREE from 'three';

// МХТС 1-р давхар: төлөвлөгөөний зургийн пиксель координатыг метр болгон барина.
// Ашиглах: main.js дотор  import { buildSchool } from './school.js';  buildSchool(scene);
export function buildSchool(scene) {
  const S = 0.12;            // 1 пиксель = 0.12 метр
  const OX = 660, OY = 555;  // (0,0) цэг = орох хаалганы үүдний танхим (тоглогч эндээс эхэлнэ)
  const H = 3;               // хананы өндөр
  const T = 0.3;             // хананы зузаан
  const DW = 1.6, DH = 2.3;  // хаалганы өргөн, өндөр
  const mx = (px) => (px - OX) * S;
  const mz = (py) => (py - OY) * S;

  const COLORS = {
    upper: 0xf3edc4, lower: 0xd8cc9c, plinth: 0x6b4f4a,
    frame: 0x5a3d38, door: 0x8a6a55, step: 0xcfc6b0,
  };
  const mats = {};
  const mat = (c) => (mats[c] ??= new THREE.MeshStandardMaterial({ color: c }));

  function addBox(parent, x, y, z, w, h, d, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  // ===== ХАНА (хаалганы нүхтэй) =====
  // wall(x1,y1,x2,y2, [хаалганы байрлал], {dw, swing, leaf})
  // Хана нь хэвтээ (y1===y2) эсвэл босоо (x1===x2) байна, x2>x1 / y2>y1.
  // doors: хананы дагуух пиксель координат (хэвтээ бол x, босоо бол y).
  // swing: хаалганы навч аль тийш нээгдэх (+1 / -1)
  function wall(x1, y1, x2, y2, doors = [], opt = {}) {
    const dw = opt.dw ?? DW;
    const swing = opt.swing ?? 1;
    const leaf = opt.leaf ?? true;
    const horiz = y1 === y2;
    const len = (horiz ? x2 - x1 : y2 - y1) * S;

    const g = new THREE.Group();
    g.position.set(mx(x1), 0, mz(y1));
    g.rotation.y = horiz ? 0 : -Math.PI / 2;
    scene.add(g);

    const start = horiz ? x1 : y1;
    const ts = doors.map((d) => (d - start) * S).sort((a, b) => a - b);

    const part = (a, b) => {
      if (b - a < 0.05) return;
      const w = b - a, c = (a + b) / 2;
      addBox(g, c, 0.45, 0, w, 0.9, T, COLORS.lower);                    // доод хэсэг
      addBox(g, c, 0.9 + (H - 0.9) / 2, 0, w, H - 0.9, T, COLORS.upper); // дээд хэсэг
      addBox(g, c, 0.07, 0, w, 0.14, T + 0.06, COLORS.plinth);           // плинтус
    };

    let cur = 0;
    ts.forEach((t) => {
      part(cur, t - dw / 2);
      addBox(g, t, (H + DH) / 2, 0, dw, H - DH, T, COLORS.upper);                // хаалганы дээд хана
      addBox(g, t - dw / 2 + 0.08, DH / 2, 0, 0.16, DH, T + 0.12, COLORS.frame); // хүрээ (зүүн)
      addBox(g, t + dw / 2 - 0.08, DH / 2, 0, 0.16, DH, T + 0.12, COLORS.frame); // хүрээ (баруун)
      addBox(g, t, DH - 0.08, 0, dw, 0.16, T + 0.12, COLORS.frame);              // хүрээ (дээд)
      if (leaf) {
        const pivot = new THREE.Group();
        pivot.position.set(t - dw / 2 + 0.16, 0, 0);
        pivot.rotation.y = swing * 1.45; // хагас нээлттэй хаалга
        const lw = dw - 0.32;
        addBox(pivot, lw / 2, DH / 2 - 0.08, 0, lw, DH - 0.16, 0.06, COLORS.door);
        g.add(pivot);
      }
      cur = t + dw / 2;
    });
    part(cur, len);
  }

  // ===== ШАЛ =====
  const texCache = {};
  function floorTex(kind) {
    if (texCache[kind]) return texCache[kind];
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#e6d9b8';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#c9bb96';
    g.lineWidth = 2;
    for (let i = 0; i <= 256; i += 64) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
    }
    if (kind === 'h' || kind === 'v') {
      g.fillStyle = '#8a4a4a'; // коридорын улаан-бор судал
      if (kind === 'h') { g.fillRect(0, 56, 256, 28); g.fillRect(0, 172, 256, 28); }
      else { g.fillRect(56, 0, 28, 256); g.fillRect(172, 0, 28, 256); }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    texCache[kind] = tex;
    return tex;
  }

  // kind: 'tile' (өрөө), 'h' (хэвтээ коридор), 'v' (босоо коридор)
  function floorRect(x1, y1, x2, y2, kind = 'tile', y = 0.02) {
    const w = (x2 - x1) * S, d = (y2 - y1) * S;
    const tex = floorTex(kind).clone();
    tex.needsUpdate = true;
    if (kind === 'tile') tex.repeat.set(w / 4, d / 4);
    else if (kind === 'h') tex.repeat.set(w / 4, 1);
    else tex.repeat.set(1, d / 4);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ map: tex })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(mx((x1 + x2) / 2), y, mz((y1 + y2) / 2));
    scene.add(m);
  }

  // ===== ШАТ (чимэглэл) =====
  function stairs(x1, y1, x2, y2) {
    const w = (x2 - x1) * S, d = (y2 - y1) * S, n = 10;
    for (let i = 0; i < n; i++) {
      const h = (i + 1) * 0.28;
      const holder = new THREE.Group();
      scene.add(holder);
      addBox(holder, mx((x1 + x2) / 2), h / 2, mz(y2) - (i + 0.5) * (d / n), w - 0.4, h, d / n, COLORS.step);
    }
  }

  // ===== ӨРӨӨНИЙ НЭР (шалан дээр) =====
  function roomLabel(text, px, py) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(0, 0, 512, 128);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 52;
    g.font = `bold ${size}px Arial`;
    while (g.measureText(text).width > 480 && size > 14) {
      size -= 2;
      g.font = `bold ${size}px Arial`;
    }
    g.fillStyle = '#3b2a22';
    g.fillText(text, 256, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 1.25),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(mx(px), 0.06, mz(py));
    scene.add(m);
  }

  // ================= ШАЛ ТАЛБАЙ =================
  floorRect(318, 325, 1082, 515);   // үндсэн жигүүр
  floorRect(630, 515, 690, 595);    // үүдний танхим
  floorRect(137, 355, 318, 905);    // баруун жигүүр
  floorRect(617, 25, 737, 325);     // хойд жигүүр
  floorRect(557, 175, 617, 237);    // хойд жигүүрийн шатны хэсэг
  floorRect(245, 408, 1082, 447, 'h', 0.03); // үндсэн коридор
  floorRect(208, 355, 245, 905, 'v', 0.03);  // баруун жигүүрийн коридор
  floorRect(662, 137, 693, 325, 'v', 0.03);  // хойд жигүүрийн коридор

  // ================= ҮНДСЭН ЖИГҮҮР =================
  // Гадна хана
  wall(318, 325, 617, 325);
  wall(617, 325, 660, 325, [640]);          // 131 өрөөний хаалга
  wall(693, 325, 737, 325);
  wall(737, 325, 1082, 325);
  wall(1082, 325, 1082, 515);
  wall(318, 325, 318, 408);
  wall(318, 447, 318, 905);
  wall(318, 515, 630, 515);
  wall(690, 515, 1082, 515);

  // Орох үүдний танхим (давхар хаалгатай)
  wall(630, 515, 630, 595);
  wall(690, 515, 690, 595);
  wall(630, 595, 690, 595, [660], { dw: 2.8, leaf: false });

  // Дээд эгнээний өрөөнүүдийн хуваалт
  [430, 480, 530, 582, 650, 735, 795, 835, 858, 892, 960].forEach((x) => wall(x, 325, x, 408));

  // Коридорын хойд тал (хаалгатай)
  wall(318, 408, 530, 408, [345, 455, 505]);   // 113, 111, бие засах газар
  wall(582, 408, 650, 408, [625]);             // 109 хувцасны өлгүүр
  wall(795, 408, 892, 408, [815, 872]);        // бие засах газар, 105
  wall(960, 408, 1082, 408, [1055]);           // 101 хурлын танхим
  wall(892, 372, 960, 372, [935]);             // 103 архивын өрөө

  // Доод эгнээний өрөөнүүд
  wall(318, 447, 583, 447, [345, 455, 510], { swing: -1 }); // 114, 112, 110
  wall(735, 447, 1082, 447, [760, 888, 935, 975], { swing: -1 }); // 108, 106, 104, 102
  [430, 485, 583, 735, 865, 912, 958, 1043].forEach((x) => wall(x, 447, x, 515));

  // Шатнууд
  stairs(534, 328, 578, 404);
  stairs(739, 328, 791, 404);

  // ================= БАРУУН ЖИГҮҮР =================
  wall(137, 355, 137, 905);
  wall(137, 355, 318, 355);
  wall(137, 905, 318, 905);
  // Баруун талын өрөөнүүд
  wall(208, 355, 208, 905, [380, 432, 575, 635, 700, 850], { swing: -1 });
  [420, 540, 620, 655, 800].forEach((y) => wall(137, y, 208, y));
  // Зүүн талын өрөөнүүд (коридорын хажуу)
  wall(245, 475, 245, 905, [492, 545, 595, 635, 662, 705, 770, 818, 870]);
  [475, 515, 570, 620, 650, 675, 740, 800, 835].forEach((y) => wall(245, y, 318, y));
  stairs(249, 518, 314, 568);

  // ================= ХОЙД ЖИГҮҮР =================
  wall(617, 25, 737, 25);
  wall(617, 25, 617, 175);
  wall(737, 25, 737, 325);
  wall(662, 25, 662, 185);
  wall(662, 137, 737, 137, [678]);           // спорт заалны хаалга
  wall(617, 185, 662, 185, [640]);           // цайны газрын хаалга
  wall(557, 175, 617, 175);
  wall(557, 175, 557, 237);
  wall(557, 237, 617, 237);
  stairs(561, 179, 613, 233);
  wall(617, 240, 662, 240);                  // 131 өрөө
  wall(617, 240, 617, 325);
  wall(662, 240, 662, 325);
  wall(693, 137, 693, 325, [155, 185, 225, 262, 300]);
  [170, 198, 250, 283].forEach((y) => wall(693, y, 737, y));

  // ================= НЭРС =================
  const labels = [
    // үндсэн жигүүр: дээд эгнээ
    ['113 Лекцийн танхим', 374, 365], ['111 Амрах өрөө', 455, 365], ['WC', 505, 365],
    ['109 Хувцасны өлгүүр', 616, 365], ['Бие даан суралцах орчин', 692, 365], ['WC', 815, 365],
    ['105 Цайны өрөө', 875, 375], ['103 Архив', 926, 350], ['101 Хурлын танхим', 1021, 365],
    // доод эгнээ
    ['114 Лекцийн танхим', 374, 481], ['112 Зэмчийн өрөө', 457, 481], ['110 МТ лаборатори', 534, 481],
    ['Лобби', 659, 481], ['108 Сургалт, чанарын алба', 800, 481], ['106', 888, 481],
    ['104', 935, 481], ['102 Захирал', 1000, 481],
    // хойд жигүүр
    ['Цайны газар', 641, 105], ['135 Спорт заал', 702, 80], ['136', 715, 154], ['137', 715, 185],
    ['Халаалт', 715, 225], ['132', 715, 266], ['130', 715, 304], ['131', 638, 285],
    ['Суралцах орчин', 638, 212],
    // баруун жигүүр
    ['115', 172, 388], ['117 Лекцийн танхим', 172, 480], ['119 Студи', 172, 580], ['121', 172, 637],
    ['125 Лаборатори', 172, 730], ['127 Лаборатори', 172, 852],
    ['Суралцах орчин', 281, 380], ['116 Агуулах', 281, 493], ['118 Лаборатори', 281, 595],
    ['120', 281, 635], ['122', 281, 662], ['124', 281, 708], ['126 Лаборатори', 281, 770],
    ['128', 281, 818], ['129', 281, 870],
  ];
  labels.forEach(([t, x, y]) => roomLabel(t, x, y));
}

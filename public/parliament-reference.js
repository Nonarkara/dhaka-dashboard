import * as THREE from "/vendor/three-0.168.0/three.module.js";
  const PARLIAMENT_COLORS = {
    concrete: 0xbfb9a9,    // pale parchment-concrete
    concreteDark: 0x9a9282,
    roof: 0x8c8272,
    shadow: 0x5d574e,
    water: 0x257da4,
  };

  // Build a geometric Parliament complex: central circular assembly hall
  // surrounded by perimeter office blocks, terraced roofs, and a reflecting
  // pool. Returns a Three.js Group positioned at the Parliament centroid.
  function buildParliamentModel(THREE) {
    const group = new THREE.Group();

    // Materials
    const matConcrete = new THREE.MeshStandardMaterial({
      color: PARLIAMENT_COLORS.concrete,
      roughness: 0.85,
      metalness: 0.05,
    });
    const matConcreteDark = new THREE.MeshStandardMaterial({
      color: PARLIAMENT_COLORS.concreteDark,
      roughness: 0.85,
      metalness: 0.05,
    });
    const matRoof = new THREE.MeshStandardMaterial({
      color: PARLIAMENT_COLORS.roof,
      roughness: 0.9,
      metalness: 0.02,
    });
    const matWater = new THREE.MeshStandardMaterial({
      color: PARLIAMENT_COLORS.water,
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
    });

    // ── Central circular assembly hall (Kahn's core form) ──
    const hallRadius = 42;
    const hallHeight = 38;
    const hall = new THREE.Mesh(
      new THREE.CylinderGeometry(hallRadius, hallRadius, hallHeight, 32),
      matConcrete
    );
    hall.position.y = hallHeight / 2;
    group.add(hall);

    // Hall roof overhang (Kahn's deep canopies)
    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(hallRadius + 14, hallRadius + 14, 6, 32),
      matRoof
    );
    roof.position.y = hallHeight + 3;
    group.add(roof);

    // ── Surrounding perimeter blocks (octagonal offices/chambers) ──
    const blockCount = 12;
    const blockRadius = hallRadius + 28;
    const blockDepth = 26;
    const blockHeight = 22;
    for (let i = 0; i < blockCount; i++) {
      const angle = (i / blockCount) * Math.PI * 2;
      const x = Math.cos(angle) * blockRadius;
      const z = Math.sin(angle) * blockRadius;
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(blockDepth, blockHeight, blockDepth),
        matConcreteDark
      );
      block.position.set(x, blockHeight / 2, z);
      block.rotation.y = angle + Math.PI / 4;
      group.add(block);

      // Block roof
      const blockRoof = new THREE.Mesh(
        new THREE.BoxGeometry(blockDepth + 4, 4, blockDepth + 4),
        matRoof
      );
      blockRoof.position.set(x, blockHeight + 2, z);
      blockRoof.rotation.y = angle + Math.PI / 4;
      group.add(blockRoof);
    }

    // ── Reflecting pool around the complex ──
    const poolRadius = blockRadius + 40;
    const pool = new THREE.Mesh(
      new THREE.CylinderGeometry(poolRadius, poolRadius, 1, 64),
      matWater
    );
    pool.position.set(0, 0.05, 0);
    group.add(pool);

    // ── Connecting bridges / walkways ──
    const walkwayRad = blockRadius + 8;
    for (let i = 0; i < blockCount; i += 3) {
      const angle = (i / blockCount) * Math.PI * 2;
      const x = Math.cos(angle) * walkwayRad;
      const z = Math.sin(angle) * walkwayRad;
      const w = new THREE.Mesh(
        new THREE.BoxGeometry(6, 1, 34),
        matConcreteDark
      );
      w.position.set(x, 3, z);
      w.rotation.y = angle;
      group.add(w);
    }

    // ── Light steps up to hall ──
    const steps = new THREE.Group();
    for (let s = 0; s < 6; s++) {
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(hallRadius * 2 - s * 10, 2, hallRadius * 2 - s * 10),
        matConcreteDark
      );
      step.position.set(0, s * 2 + 1, 0);
      steps.add(step);
    }
    group.add(steps);

    return group;
  }


// This inherited sketch is intentionally outside geographic space. Its invented
// dimensions and connecting shapes are design-study choices, not source data.
const bn = new URLSearchParams(location.search).get('lang') === 'bn';
document.documentElement.lang = bn ? 'bn' : 'en';
const tr=(en,bnText)=>bn?bnText:en;
document.title=tr('Parliament design reference · DHKx','সংসদের নকশার রেফারেন্স · DHKx');
for (const el of document.querySelectorAll('[data-en]')) el.textContent=tr(el.dataset.en,el.dataset.bn);
document.querySelector('#back').href=`/?area=parliament&lang=${bn?'bn':'en'}`;
const canvas=document.querySelector('canvas');
canvas.setAttribute('aria-label',tr('Nongeographic geometric Parliament design sketch','ভৌগোলিক নয় এমন সংসদের জ্যামিতিক নকশা'));
document.querySelector('nav').setAttribute('aria-label',tr('Sketch view','নকশার দৃশ্য'));
try {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setClearColor(0x0d171d);
  const scene=new THREE.Scene();
  scene.add(buildParliamentModel(THREE));
  scene.add(new THREE.AmbientLight(0xffffff,1));
  const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(100,200,100);scene.add(light);
  const camera=new THREE.PerspectiveCamera(45,1,1,2000);
  let angle=Math.PI/4;
  function render(){const rect=canvas.getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();camera.position.set(Math.cos(angle)*360,240,Math.sin(angle)*360);camera.lookAt(0,12,0);renderer.render(scene,camera);}
  document.querySelector('#left').onclick=()=>{angle-=Math.PI/8;render();};
  document.querySelector('#right').onclick=()=>{angle+=Math.PI/8;render();};
  new ResizeObserver(render).observe(canvas);render();
} catch {document.querySelector('#reference-status').textContent=tr('3D sketch unavailable. Return to the mapped footprints.','৩ডি নকশা অনুপলব্ধ। মানচিত্রের ভবনের সীমারেখায় ফিরে যান।');}

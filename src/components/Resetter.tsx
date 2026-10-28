import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import './resetter.css';

type ResetterProps = {
  language: 'zh' | 'en';
  sound: boolean;
  onReset: () => void;
  resetCount: number;
  onClose: () => void;
};

type Phase = 'ready' | 'pulling' | 'resetting' | 'success';

// OpenAI's Blossom appears on the physical reference device, not as this app's
// identity. Mark belongs to OpenAI: https://openai.com/brand/ . Vector reference:
// https://thesvg.org/icon/openai-chatgpt
const REFERENCE_EMBLEM = 'M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z';

const copy = {
  en: {
    title: 'The global reset', subtitle: 'A little mechanical magic.',
    close: 'Close reset device', label: 'LOCAL DEMO ONLY', count: 'RESETS DELIVERED',
    ready: 'Pull down. Start fresh.', pulling: 'A little further…', resetting: 'Reset propagating…', success: 'All local limits restored.',
    instruction: 'Drag the device to rotate it; pull the handle down to reset.',
    keyboard: 'Keyboard: ↓ to pull · Enter to reset · Shift + ← / → to rotate',
    note: 'Unlimited resets. Only your local simulation changes. Your real OpenAI account is never affected.',
    handle: 'Mechanical reset handle. Drag down or press Enter to restore local demo limits.',
    full: '100% restored', caption: 'TIBO-INSPIRED CONCEPT DEVICE', fallback: 'Compatibility renderer',
  },
  zh: {
    title: '全球额度重置器', subtitle: '一点机械的魔法。',
    close: '关闭重置装置', label: '仅限本地演示', count: '已完成重置',
    ready: '向下拉动，重新出发。', pulling: '再往下一点…', resetting: '正在传播重置…', success: '本地额度已全部恢复。',
    instruction: '拖动装置旋转查看；向下拉把手重置。',
    keyboard: '键盘：↓ 拉动 · Enter 重置 · Shift + ← / → 旋转',
    note: '可无限使用。仅改变本地模拟额度，不影响真实 OpenAI 账户。',
    handle: '机械重置把手。向下拖动或按 Enter 恢复本地演示额度。',
    full: '已恢复 100%', caption: 'TIBO 灵感概念装置', fallback: '兼容渲染模式',
  },
};

function brushedTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#bdbfbe'; ctx.fillRect(0, 0, 512, 512);
  let seed = 17;
  const noise = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let y = 0; y < 512; y++) {
    const shade = Math.floor(155 + noise() * 67);
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},0.42)`;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = `rgba(255,255,255,${noise() * 0.15})`;
      ctx.fillRect(noise() * 512, y, 40 + noise() * 260, 0.5);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export default function Resetter({ language, sound, onReset, resetCount, onClose }: ResetterProps) {
  const c = copy[language];
  const stage = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const handleHit = useRef<HTMLButtonElement>(null);
  const onResetRef = useRef(onReset);
  const soundRef = useRef(sound);
  const onCloseRef = useRef(onClose);
  onResetRef.current = onReset; soundRef.current = sound; onCloseRef.current = onClose;
  const [phase, setPhase] = useState<Phase>('ready');
  const [progress, setProgress] = useState(0);
  const [fallback, setFallback] = useState(false);
  const mechanism = useRef({ target: 0, value: 0, velocity: 0, pointer: -1, startY: 0, startPull: 0, fired: false, gestureFired: false, pulseAt: -100 });
  const rotation = useRef({ yaw: 0, pitch: 0, zoom: 1, vx: 0, vy: 0, pointer: -1, x: 0, y: 0, changed: true });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const audioContext = useRef<AudioContext | null>(null);

  const playSound = useCallback((kind: 'pull' | 'reset') => {
    if (!soundRef.current) return;
    try {
      const context = audioContext.current ?? new AudioContext();
      audioContext.current = context;
      void context.resume();
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(kind === 'reset' ? 95 : 160, now);
      oscillator.frequency.exponentialRampToValueAtTime(kind === 'reset' ? 32 : 70, now + 0.13);
      gain.gain.setValueAtTime(kind === 'reset' ? 0.15 : 0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(); oscillator.stop(now + 0.22);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    } catch { /* Audio is optional, including when browser audio is disabled. */ }
  }, []);

  const activate = useCallback(() => {
    const m = mechanism.current;
    if (m.fired || m.gestureFired) return;
    m.fired = true; m.gestureFired = true; m.target = 1; m.pulseAt = performance.now() / 1000;
    setProgress(100); setPhase('resetting'); playSound('reset');
    onResetRef.current();
    timers.current.push(setTimeout(() => { m.target = 0; setProgress(0); }, 450));
    timers.current.push(setTimeout(() => setPhase('success'), 850));
    timers.current.push(setTimeout(() => { m.fired = false; setPhase('ready'); }, 2000));
  }, [playSound]);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const amount = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * element.clientHeight : event.deltaY;
      const view = rotation.current;
      view.zoom = THREE.MathUtils.clamp(view.zoom * Math.exp(-amount * 0.0012), 0.72, 1.2);
      view.changed = true;
      element.dataset.zoom = view.zoom.toFixed(3);
      element.style.setProperty('--device-zoom', String(view.zoom));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    handleHit.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); }
      if (event.key !== 'Tab' || !dialog.current) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button, [href], [tabindex="0"]')].filter(el => !el.hasAttribute('disabled'));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      timers.current.forEach(clearTimeout);
      if (audioContext.current) void audioContext.current.close().catch(() => {});
      previous?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch { setFallback(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    element.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    // Leave enough framing room for the full 1.2× zoom and tilted views.
    // The prior tight camera cropped the upper panel when zoom and tilt combined.
    camera.position.set(1.32, 0.50, 8.2); camera.lookAt(0, 0.04, 0); camera.updateMatrixWorld();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.04);
    scene.environment = environment.texture;
    room.dispose(); pmrem.dispose();
    scene.add(new THREE.AmbientLight(0xcbd5e1, 0.65));
    const key = new THREE.DirectionalLight(0xe9f0ff, 2.2);
    key.position.set(-3, 8, 5); key.castShadow = true;
    key.shadow.mapSize.set(512, 512); key.shadow.normalBias = 0.025; key.shadow.radius = 4;
    key.shadow.camera.left = -5; key.shadow.camera.right = 5;
    key.shadow.camera.top = 5; key.shadow.camera.bottom = -5;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xaec8df, 1.25); rim.position.set(4, 2, -2); scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffffff, 0.65); fill.position.set(0, 1, 5); scene.add(fill);
    const pulse = new THREE.PointLight(0x8bfac5, 0, 8); pulse.position.set(0, -0.7, 2.5); scene.add(pulse);

    const device = new THREE.Group(); scene.add(device);
    const face = new THREE.Group(); face.rotation.x = -0.12; device.add(face);
    const brushed = brushedTexture();
    const silver = new THREE.MeshStandardMaterial({ color: 0xadb4ba, metalness: 0.74, roughness: 0.46, envMapIntensity: 0.65, map: brushed });
    const edgeSilver = new THREE.MeshStandardMaterial({ color: 0xc5cdd1, metalness: 0.82, roughness: 0.31, envMapIntensity: 0.75 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x252825, metalness: 0.55, roughness: 0.42 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x141715, metalness: 0.1, roughness: 0.78 });
    const lowerPanel = new THREE.MeshStandardMaterial({ color: 0x232a33, metalness: 0.18, roughness: 0.78, envMapIntensity: 0.25 });
    const ink = new THREE.MeshStandardMaterial({ color: 0x111411, metalness: 0.12, roughness: 0.7, side: THREE.DoubleSide });

    const box = (width: number, height: number, depth: number, radius: number, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = face) => {
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 4, radius), material);
      mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    box(1.63, 3.22, 0.30, 0.045, dark, 0, 0.17, -0.08);
    box(1.60, 3.18, 0.07, 0.025, edgeSilver, 0, 0.17, 0.065);
    box(1.55, 3.14, 0.055, 0.018, silver, 0, 0.17, 0.125);
    // The video establishes a narrow dark lower cap, not a wide freestanding
    // pedestal. Its unobserved depth remains a conservative visual estimate.
    box(1.76, 0.18, 0.56, 0.025, dark, 0, -1.50, 0.02, device);
    box(1.73, 0.04, 0.55, 0.012, rubber, 0, -1.61, 0.02, device);
    // A thin black relief preserves the reference's angular interwoven ribbons.
    const emblem = new THREE.Group(); emblem.position.set(0, 0.92, 0.165); face.add(emblem);
    const emblemSvg = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${REFERENCE_EMBLEM}" fill="#111411" fill-rule="evenodd" /></svg>`);
    for (const path of emblemSvg.paths) for (const shape of SVGLoader.createShapes(path)) {
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false, curveSegments: 16, steps: 1 });
      geometry.translate(-12, -12, 0);
      const relief = new THREE.Mesh(geometry, ink);
      relief.scale.set(0.02, -0.02, 0.02); relief.castShadow = true; emblem.add(relief);
    }
    // The paused frame shows a narrow black slot and a continuous dark lower
    // face occupying approximately 45% of the silver-framed front.
    box(1.35, 1.40, 0.035, 0.012, lowerPanel, 0, -0.68, 0.168);
    box(1.30, 0.16, 0.04, 0.008, rubber, 0, 0.15, 0.17);
    box(1.36, 0.055, 0.05, 0.007, edgeSilver, 0, 0.025, 0.19);
    // Do not add exposed mechanical rails not established by the reference.
    const lever = new THREE.Group(); lever.position.set(0, -0.11, 0.26); face.add(lever);
    // A telescoping central carrier keeps the frame mechanically connected to
    // the slot throughout travel. Its exact internal mechanism is not visible
    // in the supplied video, so this remains an inferred demonstration detail.
    const carrier = box(0.07, 1, 0.10, 0.012, edgeSilver, 0, 0, 0.34);
    for (const x of [-0.62, 0.62]) {
      box(0.075, 0.49, 0.10, 0.012, edgeSilver, x, -0.16, 0.12, lever);
    }
    box(1.36, 0.075, 0.11, 0.015, silver, 0, 0.10, 0.12, lever);
    box(1.36, 0.075, 0.13, 0.015, silver, 0, -0.42, 0.14, lever);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.12 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1.66; floor.receiveShadow = true; scene.add(floor);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0; let lastTime = performance.now() / 1000; let dirty = true; let wasPulsing = false;
    const resize = () => {
      const width = element.clientWidth, height = element.clientHeight;
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); dirty = true;
    };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const project = (x: number, y: number, z: number) => {
      const p = lever.localToWorld(new THREE.Vector3(x, y, z)).project(camera);
      return { x: (p.x + 1) / 2 * element.clientWidth, y: (1 - p.y) / 2 * element.clientHeight };
    };
    const render = () => {
      const now = performance.now() / 1000, dt = Math.min(now - lastTime, 0.032); lastTime = now;
      const m = mechanism.current;
      const orbit = rotation.current;
      if (camera.zoom !== orbit.zoom) { camera.zoom = orbit.zoom; camera.updateProjectionMatrix(); }
      if (orbit.pointer === -1 && (reducedMotion.matches || document.documentElement.dataset.motion === 'reduced')) { orbit.vx = 0; orbit.vy = 0; }
      else if (orbit.pointer === -1 && (Math.abs(orbit.vx) > 0.0001 || Math.abs(orbit.vy) > 0.0001)) {
        orbit.yaw += orbit.vx * dt * 60; orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + orbit.vy * dt * 60, -0.7, 0.7);
        const damping = Math.exp(-5 * dt); orbit.vx *= damping; orbit.vy *= damping; orbit.changed = true;
      }
      device.rotation.y = orbit.yaw; device.rotation.x = orbit.pitch;
      const moving = Math.abs(m.target - m.value) > 0.0001 || Math.abs(m.velocity) > 0.0001;
      if (reducedMotion.matches || document.documentElement.dataset.motion === 'reduced') { m.value = m.target; m.velocity = 0; }
      else {
        m.velocity += (m.target - m.value) * 170 * dt;
        m.velocity *= Math.exp(-18 * dt); m.value += m.velocity * dt;
      }
      lever.position.y = -0.11 - m.value * 0.43;
      lever.rotation.x = -m.value * 0.035;
      const carrierTop = 0.17, carrierBottom = lever.position.y + 0.10;
      carrier.scale.y = Math.max(0.04, carrierTop - carrierBottom);
      carrier.position.y = (carrierTop + carrierBottom) / 2;
      const age = now - m.pulseAt;
      pulse.intensity = age < 1.5 ? Math.sin(Math.max(0, age) / 1.5 * Math.PI) * 7 : 0;
      scene.updateMatrixWorld();
      const middle = project(0, -0.42, 0.23), left = project(-0.76, -0.42, 0.23), right = project(0.76, -0.42, 0.23);
      if (handleHit.current) {
        handleHit.current.style.left = `${middle.x}px`; handleHit.current.style.top = `${middle.y}px`;
        handleHit.current.style.width = `${Math.max(65, Math.abs(right.x - left.x))}px`;
        // A transparent hit target must not trigger from the back of the object.
        handleHit.current.style.pointerEvents = Math.cos(orbit.yaw) > 0.15 ? 'auto' : 'none';
      }
      element.dataset.rotationY = orbit.yaw.toFixed(3); element.dataset.rotationX = orbit.pitch.toFixed(3); element.dataset.zoom = orbit.zoom.toFixed(3);
      const pulsing = age >= 0 && age < 1.5;
      if (dirty || moving || pulsing || wasPulsing || orbit.changed) {
        renderer.render(scene, camera); dirty = false;
      }
      orbit.changed = false;
      wasPulsing = pulsing; raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf); observer.disconnect();
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            materials.add(material);
            Object.values(material).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); });
          }
        }
      });
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose());
      environment.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  const release = (event: React.PointerEvent<HTMLButtonElement>) => {
    const m = mechanism.current;
    if (m.pointer !== event.pointerId) return;
    m.pointer = -1;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!m.fired) { m.target = 0; setProgress(0); setPhase('ready'); playSound('pull'); }
  };

  return (
    <div className={`resetter-backdrop ${phase === 'resetting' ? 'resetter-propagating' : ''}`} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="resetter-dialog" role="dialog" aria-modal="true" aria-labelledby="resetter-title" ref={dialog}>
        <header className="resetter-header">
          <div><h2 id="resetter-title">{c.title}</h2><p>{c.label}</p></div>
          <button className="resetter-close" onClick={onClose} aria-label={c.close}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 6 18 18M18 6 6 18" /></svg></button>
        </header>
        <div className={`resetter-stage ${fallback ? 'resetter-fallback' : ''}`} ref={stage} data-renderer={fallback ? 'fallback' : 'three'} data-testid="resetter-rotate-area"
          onPointerDown={event => {
            if (event.button !== 0 || mechanism.current.pointer !== -1 || rotation.current.pointer !== -1) return;
            event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
            const orbit = rotation.current; orbit.pointer = event.pointerId; orbit.x = event.clientX; orbit.y = event.clientY; orbit.vx = 0; orbit.vy = 0;
          }}
          onPointerMove={event => {
            const orbit = rotation.current; if (orbit.pointer !== event.pointerId) return;
            const dx = event.clientX - orbit.x, dy = event.clientY - orbit.y; orbit.x = event.clientX; orbit.y = event.clientY;
            orbit.yaw += dx * 0.012; orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + dy * 0.008, -0.7, 0.7);
            orbit.vx = dx * 0.0015; orbit.vy = dy * 0.001; orbit.changed = true;
            event.currentTarget.style.setProperty('--device-yaw', `${orbit.yaw}rad`); event.currentTarget.style.setProperty('--device-pitch', `${orbit.pitch}rad`);
            event.currentTarget.dataset.rotationY = orbit.yaw.toFixed(3); event.currentTarget.dataset.rotationX = orbit.pitch.toFixed(3);
            if (fallback && handleHit.current) handleHit.current.style.pointerEvents = Math.cos(orbit.yaw) > 0.15 ? 'auto' : 'none';
          }}
          onPointerUp={event => { if (rotation.current.pointer !== event.pointerId) return; rotation.current.pointer = -1; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onPointerCancel={event => { if (rotation.current.pointer === event.pointerId) { rotation.current.pointer = -1; rotation.current.vx = 0; rotation.current.vy = 0; } }}
          onLostPointerCapture={event => { if (rotation.current.pointer === event.pointerId) rotation.current.pointer = -1; }}>
          {fallback && <div className="resetter-css-device" aria-hidden="true"><div className="resetter-css-plate"><span className="resetter-css-emblem"><svg viewBox="0 0 24 24" fill="currentColor"><path d={REFERENCE_EMBLEM} fillRule="evenodd" /></svg></span><i /><i /></div><div className="resetter-css-base" /></div>}
          <button ref={handleHit} className="resetter-handle-hit" data-testid="reset-handle" role="slider" aria-label={c.handle} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-orientation="vertical" aria-keyshortcuts="ArrowDown Enter Space Shift+ArrowLeft Shift+ArrowRight" style={fallback ? { top: `${214 + progress * 0.35}px` } : undefined}
            onPointerDown={event => {
              if (event.button !== 0 || mechanism.current.fired) return;
              event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
              const m = mechanism.current; m.gestureFired = false; m.pointer = event.pointerId; m.startY = event.clientY; m.startPull = m.target;
              setPhase('pulling'); playSound('pull');
            }}
            onPointerMove={event => {
              const m = mechanism.current;
              if (m.pointer !== event.pointerId || m.fired || m.gestureFired) return;
              const travel = Math.max(78, (stage.current?.clientHeight ?? 420) * 0.26);
              m.target = THREE.MathUtils.clamp(m.startPull + (event.clientY - m.startY) / travel, 0, 1);
              setProgress(Math.round(m.target * 100));
              if (m.target >= 0.92) activate();
            }}
            onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
            onKeyDown={event => {
              if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
                event.preventDefault(); const orbit = rotation.current; orbit.yaw += event.key === 'ArrowRight' ? 0.25 : -0.25; orbit.vx = 0; orbit.vy = 0; orbit.changed = true;
                stage.current?.style.setProperty('--device-yaw', `${orbit.yaw}rad`); if (stage.current) stage.current.dataset.rotationY = orbit.yaw.toFixed(3);
                if (fallback && handleHit.current) handleHit.current.style.pointerEvents = Math.cos(orbit.yaw) > 0.15 ? 'auto' : 'none'; return;
              }
              if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) return;
              event.preventDefault();
              if (mechanism.current.fired) return;
              if (event.repeat && mechanism.current.gestureFired) return;
              if (!event.repeat) mechanism.current.gestureFired = false;
              if (event.key === 'Enter' || event.key === ' ') { activate(); return; }
              mechanism.current.target = THREE.MathUtils.clamp(mechanism.current.target + (event.key === 'ArrowDown' ? 0.24 : -0.24), 0, 1);
              setProgress(Math.round(mechanism.current.target * 100)); setPhase('pulling'); playSound('pull');
              if (mechanism.current.target >= 0.92) activate();
            }}>
            <span className="resetter-handle-focus" />
          </button>
          {phase === 'resetting' && <div className="resetter-scan" aria-hidden="true" />}
          <div className={`resetter-result ${phase === 'success' || phase === 'resetting' ? 'visible' : ''}`} aria-hidden="true"><span>↻</span> {c.full}</div>
          {fallback && <span className="resetter-compatibility">{c.fallback}</span>}
        </div>
        <div className="resetter-status visually-hidden" role="status" aria-live="polite">{c[phase]}</div>
        <footer className="resetter-footer"><p>{c.note}</p><div><strong>{String(resetCount).padStart(3, '0')}</strong><span>{c.count}</span></div></footer>
      </section>
    </div>
  );
}

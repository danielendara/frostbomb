import * as THREE from 'three';

interface SnowflakeParticles {
  points: THREE.Points;
  dispose: () => void;
  update: (time: number, motionScale: number, isPrismMode: boolean, now: number) => void;
  setColorForMode: (mode: 'default' | 'pink' | 'prism') => void;
}

export function createParticles(prefersReducedMotion: boolean): SnowflakeParticles {
  const particleCount = prefersReducedMotion ? 80 : 200;
  const particleGeom = new THREE.BufferGeometry();
  const particlePos = new Float32Array(particleCount * 3);
  const particleVel = new Float32Array(particleCount);
  const particleSinPhase = new Float32Array(particleCount);
  const particleCosPhase = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    particlePos[i * 3] = (Math.random() - 0.5) * 20;
    particlePos[i * 3 + 1] = (Math.random() - 0.5) * 20;
    particlePos[i * 3 + 2] = (Math.random() - 0.5) * 10;
    particleVel[i] = 0.02 + Math.random() * 0.03;
    const phase = Math.random() * Math.PI * 2;
    particleSinPhase[i] = Math.sin(phase);
    particleCosPhase[i] = Math.cos(phase);
  }

  particleGeom.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
  const particleMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.05,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(particleGeom, particleMat);

  return {
    points,
    dispose: () => {
      particleGeom.dispose();
      particleMat.dispose();
    },
    setColorForMode: (mode: 'default' | 'pink' | 'prism') => {
      if (mode === 'pink') {
        particleMat.color.set('#ffb2d1');
        particleMat.opacity = 0.6;
      } else if (mode === 'default') {
        particleMat.color.set(0xffffff);
        particleMat.opacity = 0.5;
      } else {
        particleMat.opacity = 0.8;
      }
    },
    update: (time: number, motionScale: number, isPrismMode: boolean, now: number) => {
      const positions = particleGeom.attributes.position.array as Float32Array;
      const sinTime = Math.sin(time);
      const cosTime = Math.cos(time);
      const driftFactor = 0.002 * motionScale;

      // Performance Optimization: Hoist multiplication out of the loop and use additive
      // tracking for the position index (stride of 3: X, Y, Z). This reduces per-particle
      // arithmetic in the frame-start animation update.
      let idx3 = 0;
      for (let i = 0; i < particleCount; i++, idx3 += 3) {
        let px = positions[idx3];
        let py = positions[idx3 + 1];

        py -= particleVel[i] * motionScale;
        const drift = sinTime * particleCosPhase[i] + cosTime * particleSinPhase[i];
        px += drift * driftFactor;

        if (py < -10) {
          py = 10;
          px = (Math.random() - 0.5) * 20;
        }

        positions[idx3] = px;
        positions[idx3 + 1] = py;
      }
      particleGeom.attributes.position.needsUpdate = true;

      if (isPrismMode) {
        const hue = (now * 0.00015 + 0.5) % 1;
        particleMat.color.setHSL(hue, 0.8, 0.8);
      }
    }
  };
}

import * as THREE from "three";

export class SnowfallParticleSystem {
  public particles: THREE.Points;
  public geometry: THREE.BufferGeometry;
  public material: THREE.PointsMaterial;

  private particleCount: number;
  private particlePos: Float32Array;
  private particleVelBase: Float32Array;
  private particleSinPhaseBase: Float32Array;
  private particleCosPhaseBase: Float32Array;

  // Pre-scaled buffers for particle velocity and drift components.
  // Performance: Hoists motionScale & driftScale applications out of the per-frame loop.
  private particleVelScaled: Float32Array;
  private particleSinPhaseScaled: Float32Array;
  private particleCosPhaseScaled: Float32Array;

  public motionScale: number;
  public timeStep: number;
  public driftScale: number;

  constructor(prefersReducedMotion: boolean) {
    this.particleCount = prefersReducedMotion ? 80 : 200;
    this.geometry = new THREE.BufferGeometry();
    this.particlePos = new Float32Array(this.particleCount * 3);
    this.particleVelBase = new Float32Array(this.particleCount);
    this.particleSinPhaseBase = new Float32Array(this.particleCount);
    this.particleCosPhaseBase = new Float32Array(this.particleCount);

    this.particleVelScaled = new Float32Array(this.particleCount);
    this.particleSinPhaseScaled = new Float32Array(this.particleCount);
    this.particleCosPhaseScaled = new Float32Array(this.particleCount);

    for (let i = 0; i < this.particleCount; i++) {
      this.particlePos[i * 3] = (Math.random() - 0.5) * 20;
      this.particlePos[i * 3 + 1] = (Math.random() - 0.5) * 20;
      this.particlePos[i * 3 + 2] = (Math.random() - 0.5) * 10;
      this.particleVelBase[i] = 0.02 + Math.random() * 0.03;
      const phase = Math.random() * Math.PI * 2;
      this.particleSinPhaseBase[i] = Math.sin(phase);
      this.particleCosPhaseBase[i] = Math.cos(phase);
    }

    this.motionScale = prefersReducedMotion ? 0.25 : 1;
    this.timeStep = 0.3 * this.motionScale;
    this.driftScale = 0.002 * this.motionScale;
    this.updateScaledBuffers();

    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.particlePos, 3));
    this.material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.05,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
    });
    this.particles = new THREE.Points(this.geometry, this.material);
  }

  public updateScaledBuffers(): void {
    for (let i = 0; i < this.particleCount; i++) {
      this.particleVelScaled[i] = this.particleVelBase[i] * this.motionScale;
      this.particleSinPhaseScaled[i] = this.particleSinPhaseBase[i] * this.driftScale;
      this.particleCosPhaseScaled[i] = this.particleCosPhaseBase[i] * this.driftScale;
    }
  }

  public setReducedMotion(prefersReducedMotion: boolean): void {
    this.motionScale = prefersReducedMotion ? 0.25 : 1;
    this.timeStep = 0.3 * this.motionScale;
    this.driftScale = 0.002 * this.motionScale;
    this.updateScaledBuffers();
  }

  public update(time: number, isPrismMode: boolean, now: number): void {
    const positions = this.geometry.attributes.position.array as Float32Array;

    // Optimization: Trig identity sin(a + b) = sin(a)cos(b) + cos(a)sin(b)
    // Replaces 200 sin() calls with 2 sin/cos calls per frame.
    const sinTime = Math.sin(time);
    const cosTime = Math.cos(time);

    let idx3 = 0;
    for (let i = 0; i < this.particleCount; i++) {
      let px = positions[idx3];
      let py = positions[idx3 + 1];

      py -= this.particleVelScaled[i];
      const drift =
        sinTime * this.particleCosPhaseScaled[i] +
        cosTime * this.particleSinPhaseScaled[i];
      px += drift;

      if (py < -10) {
        py = 10;
        px = (Math.random() - 0.5) * 20;
      }

      positions[idx3] = px;
      positions[idx3 + 1] = py;
      idx3 += 3;
    }
    this.geometry.attributes.position.needsUpdate = true;

    if (isPrismMode) {
      const hue = (now * 0.00015 + 0.5) % 1;
      this.material.color.setHSL(hue, 0.8, 0.8);
    }
  }

  public setPinkMode(enabled: boolean, isPrismMode: boolean): void {
    if (isPrismMode) return;
    if (enabled) {
      this.material.color.set("#ffb2d1");
      this.material.opacity = 0.6;
    } else {
      this.material.color.set(0xffffff);
      this.material.opacity = 0.5;
    }
  }

  public setPrismMode(enabled: boolean, isPinkMode: boolean): void {
    if (!enabled) {
      this.setPinkMode(isPinkMode, false);
    } else {
      this.material.opacity = 0.8;
    }
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
